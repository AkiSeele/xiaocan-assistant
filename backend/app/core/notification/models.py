"""
标准通知模型与事件定义
遵循对标 BetterGI 的设计规范，严禁使用任何 Emoji
"""
from enum import Enum
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
import time


class NotificationEvent(str, Enum):
    """系统业务事件枚举"""
    GRAB_SUCCESS = "grab_success"          # 霸王餐抢单锁定成功
    SPIKE_SUCCESS = "spike_success"        # 09:30 SVIP/大牌秒杀中签
    MEITUAN_COUPON = "meituan_coupon"      # 美团外卖券自动领取成功
    APPOINT_EVENT = "appoint_event"        # 店铺预约建立与开抢提醒
    TOKEN_WARN = "token_warn"              # 账号凭据失效或安全风控报警
    COUPON_EXPIRE = "coupon_expire"        # 卡券即将到期预警
    TASK_FAIL = "task_fail"                # 抢单失败/名额售罄/异常中断
    SYSTEM_TEST = "system_test"            # 通道连通性测试消息


class NotificationLevel(str, Enum):
    """通知等级"""
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class NotificationData:
    """标准化通知实体"""
    title: str
    content: str
    event: NotificationEvent = NotificationEvent.GRAB_SUCCESS
    level: NotificationLevel = NotificationLevel.INFO
    account_key: Optional[str] = None
    account_name: Optional[str] = None
    timestamp: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def format_plain_text(self) -> str:
        """生成通用的纯文本格式（无 Emoji，严谨清晰）"""
        lines = [f"[小蚕小帮手] {self.title}"]
        if self.account_name:
            lines.append(f"账号: {self.account_name}")
        lines.append(self.content)
        return "\n".join(lines)

    def format_markdown(self) -> str:
        """生成支持 Markdown 排版的通道文本（加粗、引用与分块）"""
        level_tag = f"[{self.level.value.upper()}]"
        lines = [f"### [小蚕小帮手] {self.title} {level_tag}"]
        if self.account_name:
            lines.append(f"- **执行账号**: {self.account_name}")
        time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.timestamp))
        lines.append(f"- **触发时间**: {time_str}")
        lines.append("")
        lines.append(self.content)
        return "\n".join(lines)
