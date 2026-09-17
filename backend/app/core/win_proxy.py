"""
Windows 系统代理管理器 (WinINet Proxy Manager)
支持一键将 Windows 系统代理指向本地嗅探端口，并在抓取完成后安全、无损地还原用户原有的系统代理。
附带 atexit 安全守卫，确保程序意外退出时系统代理必定被还原，杜绝断网风险。
"""
import atexit
import ctypes
import logging
import os
import sys
from typing import Optional, Tuple

logger = logging.getLogger("xiaocan.win_proxy")

INTERNET_OPTION_SETTINGS_CHANGED = 39
INTERNET_OPTION_REFRESH = 37


class WindowsProxyManager:
    REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"

    def __init__(self):
        self.is_applied: bool = False
        self.orig_enable: Optional[int] = None
        self.orig_server: Optional[str] = None
        self.orig_override: Optional[str] = None
        self._registered_exit: bool = False

    def _is_windows(self) -> bool:
        return sys.platform == "win32"

    def backup_settings(self) -> Tuple[Optional[int], Optional[str], Optional[str]]:
        if not self._is_windows():
            return None, None, None
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.REG_PATH, 0, winreg.KEY_READ) as key:
                try:
                    self.orig_enable, _ = winreg.QueryValueEx(key, "ProxyEnable")
                except FileNotFoundError:
                    self.orig_enable = 0

                try:
                    self.orig_server, _ = winreg.QueryValueEx(key, "ProxyServer")
                except FileNotFoundError:
                    self.orig_server = ""

                try:
                    self.orig_override, _ = winreg.QueryValueEx(key, "ProxyOverride")
                except FileNotFoundError:
                    self.orig_override = ""

            logger.info(f"已备份原始 Windows 代理配置: Enable={self.orig_enable}, Server={self.orig_server}")
            return self.orig_enable, self.orig_server, self.orig_override
        except Exception as e:
            logger.error(f"备份 Windows 系统代理失败: {e}")
            return None, None, None

    def enable_proxy(self, host: str = "127.0.0.1", port: int = 8699) -> bool:
        if not self._is_windows():
            logger.warning("当前非 Windows 环境，跳过设置系统代理")
            return False

        if not self.is_applied:
            self.backup_settings()

        proxy_str = f"{host}:{port}"
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.REG_PATH, 0, winreg.KEY_SET_VALUE) as key:
                winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
                winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, proxy_str)
                # 排除本地循环地址与局域网
                override = "<-loopback>;<local>;127.*;192.168.*;10.*"
                winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ, override)

            self._refresh_wininet()
            self.is_applied = True

            if not self._registered_exit:
                atexit.register(self.restore_proxy)
                self._registered_exit = True

            logger.info(f"Windows 系统代理已切换为: {proxy_str}")
            return True
        except Exception as e:
            logger.error(f"切换 Windows 系统代理异常: {e}")
            return False

    def restore_proxy(self) -> bool:
        if not self._is_windows() or not self.is_applied:
            return True

        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.REG_PATH, 0, winreg.KEY_SET_VALUE) as key:
                enable_val = self.orig_enable if self.orig_enable is not None else 0
                winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, enable_val)

                if self.orig_server is not None:
                    winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, self.orig_server)
                else:
                    try:
                        winreg.DeleteValue(key, "ProxyServer")
                    except FileNotFoundError:
                        pass

                if self.orig_override is not None:
                    winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ, self.orig_override)

            self._refresh_wininet()
            self.is_applied = False
            logger.info("已成功恢复原始 Windows 系统代理配置")
            return True
        except Exception as e:
            logger.error(f"恢复 Windows 系统代理异常: {e}")
            return False

    def _refresh_wininet(self):
        try:
            wininet = ctypes.windll.wininet
            wininet.InternetSetOptionW(0, INTERNET_OPTION_SETTINGS_CHANGED, 0, 0)
            wininet.InternetSetOptionW(0, INTERNET_OPTION_REFRESH, 0, 0)
        except Exception as e:
            logger.warning(f"WinINet 广播通知失败: {e}")


# 全局单例
win_proxy = WindowsProxyManager()
