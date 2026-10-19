"""
通知通道抽象基类
"""
from abc import ABC, abstractmethod
from typing import Dict, Any
from ..models import NotificationData


class BaseNotifier(ABC):
    """通知通道基类契约"""

    @property
    @abstractmethod
    def name(self) -> str:
        """通道唯一标识"""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """通道展示名称"""
        pass

    @abstractmethod
    async def send(self, data: NotificationData) -> Dict[str, Any]:
        """异步发送标准通知"""
        pass

    @abstractmethod
    async def test(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """独立连通性测试"""
        pass
