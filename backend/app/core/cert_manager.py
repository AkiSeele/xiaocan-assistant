"""
SSL 动态证书生成与管理 (Certificate Manager)
用于支持小蚕助手的 HTTPS 嗅探：为小蚕相关域名 (*.xiaocan.cn / *.xiaocan.com) 动态签发证书。
非小蚕域名的流量通过纯 TCP 隧道透传，绝不干涉其它网络连接。
"""
import datetime
import os
import subprocess
import logging
from typing import Tuple, Dict

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

logger = logging.getLogger("xiaocan.cert_manager")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CERTS_DIR = os.path.join(BASE_DIR, "certs")
CA_KEY_PATH = os.path.join(CERTS_DIR, "xiaocan_ca.key")
CA_CERT_PATH = os.path.join(CERTS_DIR, "xiaocan_ca.crt")


class CertManager:
    def __init__(self):
        os.makedirs(CERTS_DIR, exist_ok=True)
        self.ca_key = None
        self.ca_cert = None
        self._host_cert_cache: Dict[str, Tuple[bytes, bytes]] = {}
        self._init_ca()

    def _init_ca(self):
        if os.path.exists(CA_KEY_PATH) and os.path.exists(CA_CERT_PATH):
            try:
                with open(CA_KEY_PATH, "rb") as f:
                    self.ca_key = serialization.load_pem_private_key(f.read(), password=None)
                with open(CA_CERT_PATH, "rb") as f:
                    self.ca_cert = x509.load_pem_x509_certificate(f.read())
                logger.info("已加载现有小蚕根证书 (CA)")
                return
            except Exception as e:
                logger.warning(f"加载现有 CA 失败，将重新生成: {e}")

        # 生成新 CA
        self.ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, "XiaoCan Assistant CA"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "XiaoCan Assistant Security"),
            x509.NameAttribute(NameOID.COUNTRY_NAME, "CN")
        ])
        now = datetime.datetime.now(datetime.timezone.utc)
        self.ca_cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(self.ca_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=3650)) # 10 年有效
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .sign(self.ca_key, hashes.SHA256())
        )

        with open(CA_KEY_PATH, "wb") as f:
            f.write(self.ca_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))

        with open(CA_CERT_PATH, "wb") as f:
            f.write(self.ca_cert.public_bytes(serialization.Encoding.PEM))

        logger.info(f"成功生成新的小蚕根证书: {CA_CERT_PATH}")

    def get_ca_cert_path(self) -> str:
        return CA_CERT_PATH

    def is_ca_installed(self) -> bool:
        """检查根证书是否已经存在于 Windows 当前用户的根证书存储中"""
        try:
            res = subprocess.run(["certutil", "-user", "-store", "Root"], capture_output=True, text=True)
            return "XiaoCan Assistant CA" in res.stdout
        except Exception:
            return False

    def install_ca_cert(self) -> bool:
        """非阻塞唤起 Windows 证书安装确认框"""
        try:
            if not os.path.exists(CA_CERT_PATH):
                self._init_ca()
            # 使用 subprocess.Popen 避免阻塞主进程，直接在桌面弹出 Windows 安全确认框
            subprocess.Popen(["certutil", "-user", "-addstore", "Root", CA_CERT_PATH])
            return True
        except Exception as e:
            logger.error(f"唤起安装 CA 失败: {e}")
            return False

    def get_or_create_host_cert(self, hostname: str) -> Tuple[bytes, bytes]:
        """动态为目标域名签发证书，返回 (cert_pem, key_pem)"""
        if hostname in self._host_cert_cache:
            return self._host_cert_cache[hostname]

        host_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, hostname),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "XiaoCan Assistant Sniffer")
        ])
        now = datetime.datetime.now(datetime.timezone.utc)
        
        # 兼容顶级域名通配
        sans = [x509.DNSName(hostname)]
        if not hostname.startswith("*."):
            sans.append(x509.DNSName(f"*.{hostname}"))

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(self.ca_cert.subject)
            .public_key(host_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName(sans), critical=False)
            .sign(self.ca_key, hashes.SHA256())
        )

        cert_pem = cert.public_bytes(serialization.Encoding.PEM)
        key_pem = host_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        )

        self._host_cert_cache[hostname] = (cert_pem, key_pem)
        return cert_pem, key_pem


# 全局单例
cert_mgr = CertManager()
