"""
小蚕霸王餐异步 RPC 客户端
负责与 gw.xiaocantech.com/rpc 进行通信
"""
import logging
import uuid
from typing import Any, Dict, Optional
import httpx
from .signer import generate_headers

logger = logging.getLogger("xiaocan.protocol")

GW_BASE_URL = "https://gw.xiaocantech.com/rpc"


class XiaoCanRPCError(Exception):
    def __init__(self, code: int, msg: str, raw: Optional[Dict[str, Any]] = None):
        super().__init__(f"XiaoCan RPC Error [{code}]: {msg}")
        self.code = code
        self.msg = msg
        self.raw = raw or {}


class XiaoCanClient:
    def __init__(self, timeout: float = 10.0):
        self.timeout = timeout
        self.session = httpx.AsyncClient(
            http2=True,
            timeout=timeout,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20)
        )

    async def close(self):
        await self.session.aclose()

    async def invoke_rpc(
        self,
        server_name: str,
        method_name: str,
        body: Optional[Dict[str, Any]] = None,
        city_code: int = 440303,
        token: Optional[str] = None,
        user_id: Optional[str] = None,
        silk_id: Optional[str] = None
    ) -> Dict[str, Any]:
        payload = dict(body) if body else {}
        if "app_id" not in payload:
            payload["app_id"] = 20
        headers = generate_headers(
            server_name=server_name,
            method_name=method_name,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

        try:
            resp = await self.session.post(
                GW_BASE_URL,
                json=payload,
                headers=headers
            )
            data = resp.json()
        except Exception as e:
            logger.error(f"RPC {server_name}.{method_name} network failure: {e}")
            raise

        # 1. 检查网关返回的顶层 error (例如 Go micro 500/400 异常)
        if "error" in data:
            err_raw = data.get("error")
            err_code = 500
            err_msg = str(err_raw)
            if isinstance(err_raw, str) and err_raw.startswith("{"):
                try:
                    import json
                    parsed_err = json.loads(err_raw)
                    err_code = parsed_err.get("code", 500)
                    err_msg = parsed_err.get("detail") or parsed_err.get("status") or str(err_raw)
                except Exception:
                    pass
            logger.error(f"RPC {server_name}.{method_name} gateway error: code={err_code}, msg={err_msg}")
            raise XiaoCanRPCError(code=err_code, msg=err_msg, raw=data)

        # 2. 检查业务层 status 结构
        status = data.get("status") or {}
        if isinstance(status, dict):
            code = status.get("code", 0)
            msg = status.get("msg", "ok")
        else:
            code = data.get("code", 500) if isinstance(data.get("code"), int) else 500
            msg = str(status or data.get("detail") or data.get("msg") or "RPC Error")

        if code != 0:
            if code in (3, 25, 40002, 40003, 40004, 40037, 40038, 40039, 40040):
                logger.info(f"RPC {server_name}.{method_name} notice: code={code}, msg={msg}")
            else:
                logger.warning(f"RPC {server_name}.{method_name} rejected: code={code}, msg={msg}")
            raise XiaoCanRPCError(code=code, msg=msg, raw=data)

        return data

    # ---------------- 核心业务 API 封装 ---------------- #

    async def get_store_list(
        self,
        city_code: int,
        longitude: str,
        latitude: str,
        offset: int = 0,
        limit: int = 20,
        token: Optional[str] = None,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        sort: int = 0,
        store_platform: int = 0,
        scene: int = 2,
        meal_period: int = 3
    ) -> Dict[str, Any]:
        """获取外卖霸王餐附近店铺清单 (优先调用官方核心推荐 SilkwormFusion.FusionService.GetFeedPromotions，回落 RecService.GetStorePromotionList)"""
        # 1. 优先调用官方主页核心推荐 (GetFeedPromotions)
        fusion_body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "lon": float(longitude),
            "lat": float(latitude),
            "number": int(limit),
            "offset": int(offset),
            "sort": int(sort) if sort else 0,
            "scene": 1,
            "is_show_mt": True,
            "page_pv_id": str(uuid.uuid4()),
            "app_id": 20
        }
        try:
            res = await self.invoke_rpc(
                server_name="SilkwormFusion",
                method_name="FusionService.GetFeedPromotions",
                body=fusion_body,
                city_code=city_code,
                token=token,
                user_id=user_id,
                silk_id=silk_id
            )
            if res.get("feed_items"):
                return res
        except Exception as e:
            logger.warning(f"GetFeedPromotions 调用异常，尝试切换至 RecService: {e}")

        # 2. 备选调用官方多平台聚合推荐 (GetStorePromotionList)
        rec_body = {
            "city_code": int(city_code),
            "silk_id": int(silk_id) if silk_id else 0,
            "longitude": float(longitude),
            "latitude": float(latitude),
            "number": int(limit),
            "offset": int(offset),
            "promotion_sort": 1 if sort == 1 else 4,
            "promotion_category": 0,
            "promotion_filter": 0,
            "store_category": 0,
            "store_platform": int(store_platform),
            "store_type": 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormRec",
            method_name="RecService.GetStorePromotionList",
            body=rec_body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def search_stores(
        self,
        keyword: str,
        city_code: int,
        longitude: str,
        latitude: str,
        offset: int = 0,
        limit: int = 20,
        token: Optional[str] = None,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """调用小蚕官方微服务实时搜索店铺 (SilkwormFusion.FusionService.SearchPromotions)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "lat": float(latitude),
            "lon": float(longitude),
            "keyword": keyword.strip(),
            "offset": int(offset),
            "number": min(20, max(1, int(limit))),
            "app_id": 20
        }
        res = await self.invoke_rpc(
            server_name="SilkwormFusion",
            method_name="FusionService.SearchPromotions",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )
        if "promotions" in res and "promotion_list" not in res:
            res["promotion_list"] = res["promotions"]
        return res

    async def get_explore_store_list(
        self,
        city_code: int,
        longitude: str,
        latitude: str,
        offset: int = 0,
        limit: int = 20,
        token: Optional[str] = None,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """获取到店/探店团购霸王餐清单 (ExploreMobile.ListGroupPromotion)"""
        page_num = (int(offset) // int(limit)) + 1 if limit else 1
        body = {
            "loc": {
                "lat": float(latitude),
                "lng": float(longitude)
            },
            "city_code": int(city_code),
            "silk_id": int(silk_id) if silk_id else 0,
            "dist_item": 30000,
            "page": {
                "page_num": page_num,
                "page_size": int(limit)
            },
            "filter": {
                "is_brand": False,
                "is_can_order": True,
                "is_discount_lt4": False,
                "is_done_bargain": False,
                "is_multi": False,
                "is_single": False,
                "original_price_get": 0,
                "store_first_category": 0
            },
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormExplore",
            method_name="ExploreMobile.ListGroupPromotion",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_order_list(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        order_status: int = 99,
        offset: int = 0,
        number: int = 20,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取用户霸王餐订单列表 (Silkworm.SilkwormService.GetPromotionOrderList)"""
        # 官方真实状态集：0=待上传, 1=审核中, 2=已完成, 3=已驳回, 4=已取消, 15=待处理角标, 99=全部
        if order_status in (0, 1, 2, 3, 4, 15, 99):
            body_st = int(order_status)
        else:
            body_st = 99

        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "offset": int(offset),
            "number": int(number),
            "order_status": body_st,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="Silkworm",
            method_name="SilkwormService.GetPromotionOrderList",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def search_shangjin_stores(
        self,
        keyword: str,
        latitude: float,
        longitude: float,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440304,
        sort_type: int = 3,
        page_pv_id: str = ""
    ) -> Dict[str, Any]:
        """获取美团按比例返现/赏金商户活动 (SilkwormRcs.SilkwormRcsService.MeituanShangjinGetPoiList)"""
        body = {
            "lat": float(latitude),
            "lng": float(longitude),
            "silk_id": int(silk_id) if silk_id else 0,
            "page_pv_id": page_pv_id or "",
            "sort_type": int(sort_type),
            "search_word": keyword.strip() if keyword else "",
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormRcs",
            method_name="SilkwormRcsService.MeituanShangjinGetPoiList",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_user_info(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取小蚕官方真实个人资料 (Silkworm.SilkwormService.GetClientUserInfo)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "if_need_subscribe": True,
            "if_need_notify_status": True,
            "inviter_silk_id": 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="Silkworm",
            method_name="SilkwormService.GetClientUserInfo",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    # ---------------- 官方任务中心与元宝生态 (ActivityTask / Vip) ---------------- #

    async def get_user_task_v2(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取元宝总览与待领取状态 (ActivityTask.ActivityTaskMobileService.UserTaskV2)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.UserTaskV2",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_unreceived_point_records(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 10,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取待领取元宝明细列表 (ActivityTask.ActivityTaskMobileService.GetUnReceivedPointRecords)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "page": int(page),
            "page_size": int(page_size),
            "status": 1,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.GetUnReceivedPointRecords",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_wait_claimed_points(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取待领取的元宝点数统计 (ActivityTask.ActivityTaskMobileService.WaitClaimedPoints)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.WaitClaimedPoints",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_user_sign_in_days(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取会员每日连续签到天数与今日签到状态 (SilkwormVip.VipRightsService.UserSignInDays)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="VipRightsService.UserSignInDays",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_sign_in_node(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取签到里程碑节点奖励状态 (SilkwormVip.VipRightsService.SignInNode)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "need_status": True,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="VipRightsService.SignInNode",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def check_activity_eligibility(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """检查用户活动与红包雨参与资格 (SilkwormShareSupport.SilkwormShareSupportService.CheckActivityEligibility)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "check_red_packet_guide": True,
            "check_subscribe": True,
            "check_supporter_experiment": True,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormShareSupport",
            method_name="SilkwormShareSupportService.CheckActivityEligibility",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_client_withdraw_list(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        offset: int = 0,
        number: int = 10,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取提现记录列表 (Silkworm.SilkwormService.GetClientWithdrawList)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "offset": int(offset),
            "number": int(number),
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="Silkworm",
            method_name="SilkwormService.GetClientWithdrawList",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    # ---------------- 消息中心 (SilkwormMessageCenter) ---------------- #

    async def get_message_channels(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取消息中心频道分类及未读数 (SilkwormMessageCenter.MessageCenterService.ListChannelsSimple)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "page": 1,
            "page_size": 20,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormMessageCenter",
            method_name="MessageCenterService.ListChannelsSimple",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def get_messages(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        channel_id: Optional[int] = None,
        page: int = 1,
        page_size: int = 20,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取消息列表 (SilkwormMessageCenter.MessageCenterService.ListMessages)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "page": int(page),
            "page_size": int(page_size),
            "app_id": 20
        }
        if channel_id is not None and channel_id > 0:
            body["channel_id"] = int(channel_id)
        else:
            body["query_all"] = True

        return await self.invoke_rpc(
            server_name="SilkwormMessageCenter",
            method_name="MessageCenterService.ListMessages",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    async def set_all_messages_read(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """将当前账号所有消息标记为已读 (SilkwormMessageCenter.MessageCenterService.SetMessageAllRead)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormMessageCenter",
            method_name="MessageCenterService.SetMessageAllRead",
            body=body,
            city_code=city_code,
            token=token,
            user_id=user_id,
            silk_id=silk_id
        )

    # ---------------- 官方微服务日常任务与营销活动 ---------------- #

    async def do_user_sign(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """元宝乐园每日签到 (SilkwormMobileMarketingService.UserSign)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormMarketing",
            method_name="SilkwormMobileMarketingService.UserSign",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def do_checkin(self, token: str, city_code: int = 440303, silk_id: Optional[str] = None, user_id: Optional[str] = None) -> Dict[str, Any]:
        """每日签到打卡 (兼容旧接口别名)"""
        return await self.do_user_sign(token=token, silk_id=silk_id, user_id=user_id, city_code=city_code)

    async def complete_task_event(
        self,
        task_type: int,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """完成任务领奖励 (SilkwormMobileMarketingService.CompleteTaskEvent: 3=饿了么, 4=美团, 6=社群)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "task_type": int(task_type)
        }
        return await self.invoke_rpc(
            server_name="SilkwormMarketing",
            method_name="SilkwormMobileMarketingService.CompleteTaskEvent",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def incr_lottery_number(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """增加每日抽奖机会 (SilkwormMobileMarketingService.UserIncrLotteryNumber)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormMarketing",
            method_name="SilkwormMobileMarketingService.UserIncrLotteryNumber",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_vip_up_gift(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取/激活会员升级及每日专属成长礼包 (SilkwormMobileMarketingService.GetUserUpVipGift)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormMarketing",
            method_name="SilkwormMobileMarketingService.GetUserUpVipGift",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def list_vip_gifts(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取会员专属权益礼包列表 (SilkwormMobileMarketingService.ListVipGifts)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormMarketing",
            method_name="SilkwormMobileMarketingService.ListVipGifts",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def list_vip_gift_details(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取各VIP等级特权卡券明细 (SilkwormMobileMarketingService.ListVipGiftDetails)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormMarketing",
            method_name="SilkwormMobileMarketingService.ListVipGiftDetails",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_vip_task(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取会员成长任务状态 (SilkwormVipMobile.GetVipTask)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="SilkwormVipMobile.GetVipTask",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_vip_prizes(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取会员专属每日膨胀红包池与成长值 (SilkwormVipMobile.VipPrizes)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="SilkwormVipMobile.VipPrizes",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_vip_rebate_info(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取会员专属大牌秒杀与返利库存 (SilkwormVipMobile.GetVipRebateInfo)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="SilkwormVipMobile.GetVipRebateInfo",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    # ---------------- 官方转盘与幸运抽奖 ---------------- #

    async def get_lottery_info(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取今日幸运转盘配置与剩余抽奖机会 (SilkwormLotteryMobile.LotteryInfo)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.LotteryInfo",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def add_lottery_times(
        self,
        lottery_type: int,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """领取免费任务赠送的抽奖机会 (SilkwormLotteryMobile.AddLotteryTimes: 2=分享, 8=饿了么, 9=美团, 10=到店, 11=福利)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "type": int(lottery_type)
        }
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.AddLotteryTimes",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def do_lottery_spin(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """执行幸运转盘抽奖 (SilkwormLotteryMobile.Lottery)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.Lottery",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_lottery_progress(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取阶梯累计抽奖进度 (SilkwormLotteryMobile.GetLotteryProgress)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.GetLotteryProgress",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    # ---------------- 官方整点红包雨与权益秒杀 ---------------- #

    async def get_redpack_rain_event(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取当前或即将开始的红包雨场次信息 (SilkwormLotteryMobile.GetRedPackRainEvent)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "city_code": int(city_code)
        }
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.GetRedPackRainEvent",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def join_redpack_rain(
        self,
        token: str,
        event_id: Optional[int] = None,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """报名/接入整点红包雨场次 (SilkwormLotteryMobile.JoinRedPackRainEvent)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "city_code": int(city_code)
        }
        if event_id:
            body["event_id"] = int(event_id)
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.JoinRedPackRainEvent",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def grab_redpack_rain(
        self,
        token: str,
        event_id: Optional[int] = None,
        click_num: int = 15,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """在红包雨进行时抢抓红包额度 (SilkwormLotteryMobile.RedPackRainGrabNum)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "click_num": int(click_num)
        }
        if event_id:
            body["event_id"] = int(event_id)
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.RedPackRainGrabNum",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def list_user_redpack(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """查询用户领取的红包雨红包记录 (SilkwormLotteryMobile.ListUserRedPack)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormLottery",
            method_name="SilkwormLotteryMobile.ListUserRedPack",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_vip_prizes(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """查询每日 09:30 SVIP 大牌券与膨胀奖池配置 (SilkwormVipMobile.VipPrizes)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="SilkwormVipMobile.VipPrizes",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def vip_prizes_lottery(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303,
        vip_level: int = 0
    ) -> Dict[str, Any]:
        """执行每日 09:30 SVIP 大牌券/膨胀礼金秒杀抽奖 (SilkwormVipMobile.VipPrizesLottery)"""
        body: Dict[str, Any] = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        if vip_level:
            body["level"] = int(vip_level)
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="SilkwormVipMobile.VipPrizesLottery",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_vip_rebate_info(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """查询每日 09:00 SVIP 专属返利券库存与进度 (SilkwormVipMobile.GetVipRebateInfo)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="SilkwormVip",
            method_name="SilkwormVipMobile.GetVipRebateInfo",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def exchange_goods(
        self,
        goods_id: int,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """元宝商城限量秒杀兑换商品 (SilkwormMobileCommunityService.ExchangeGoods)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "goods_id": int(goods_id),
            "city_code": int(city_code)
        }
        return await self.invoke_rpc(
            server_name="SilkwormCommunity",
            method_name="SilkwormMobileCommunityService.ExchangeGoods",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def grab_promotion_quota(
        self,
        promotion_id: Any,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303,
        store_platform: int = 1,
        if_advance_order: bool = False,
        latitude: float = 0.0,
        longitude: float = 0.0,
        redpack_id: Optional[Any] = None,
        vip_extra_silk_card_id: Optional[Any] = None
    ) -> Dict[str, Any]:
        """抢占霸王餐秒杀名额配额 (SilkwormService.GrabPromotionQuota)"""
        try:
            pid_int = int(promotion_id)
        except Exception:
            pid_int = 0

        # 对齐微信小程序与小蚕官方 Go struct：仅在有效时传递 int64 类型字段，严禁传空字符串
        body: Dict[str, Any] = {
            "silk_id": int(silk_id) if silk_id else 0,
            "promotion_id": pid_int,
            "store_platform": int(store_platform or 1),
            "if_advance_order": bool(if_advance_order),
            "if_pre_order": False,
            "latitude": float(latitude or 0.0),
            "longitude": float(longitude or 0.0),
            "city_code": int(city_code or 440303)
        }
        if redpack_id is not None:
            try:
                r_int = int(redpack_id)
                if r_int > 0:
                    body["redpack_id"] = r_int
            except (ValueError, TypeError):
                pass
        if vip_extra_silk_card_id is not None:
            try:
                v_int = int(vip_extra_silk_card_id)
                if v_int > 0:
                    body["vip_extra_silk_card_id"] = v_int
            except (ValueError, TypeError):
                pass

        return await self.invoke_rpc(
            server_name="Silkworm",
            method_name="SilkwormService.GrabPromotionQuota",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_user_max_redpack(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取用户当前可用红包清单与最大红包 (RedPackService.GetUserMaxRedPack)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="RedPackService",
            method_name="RedPackService.GetUserMaxRedPack",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def cancel_promotion_quota(
        self,
        promotion_order_id: Any,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """取消已抢到的霸王餐订单名额 (SilkwormService.CancelPromotionQuota)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "promotion_order_id": int(promotion_order_id)
        }
        return await self.invoke_rpc(
            server_name="Silkworm",
            method_name="SilkwormService.CancelPromotionQuota",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_store_promotion_detail(
        self,
        promotion_id: Any,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """查询店铺霸王餐活动实时库存与详情 (SilkwormService.GetStorePromotionDetail)"""
        try:
            pid_int = int(promotion_id)
        except Exception:
            pid_int = 0

        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "promotion_id": pid_int
        }
        return await self.invoke_rpc(
            server_name="Silkworm",
            method_name="SilkwormService.GetStorePromotionDetail",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def appoint_store(
        self,
        token: str,
        promotion_id: str,
        redpack_mode: int = 0,
        redpack_id: Optional[str] = None,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """提交店铺霸王餐预约抢单 (PromotionService.AppointOrder)"""
        body = {
            "promotion_id": str(promotion_id),
            "redpack_mode": int(redpack_mode),
            "redpack_id": redpack_id or "",
            "app_id": 20,
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="Promotion",
            method_name="PromotionService.AppointOrder",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    # ---------------- 官方钱包提现与卡券资产 ---------------- #

    async def client_withdraw(
        self,
        money_cents: int,
        token: str,
        withdraw_type: int = 1,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """钱包余额申请提现到微信或支付宝 (SilkwormService.ClientWithdraw)
        withdraw_type: 0 微信钱包, 1 支付宝
        """
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "money": int(money_cents),
            "type": int(withdraw_type)
        }
        return await self.invoke_rpc(
            server_name="Silkworm",
            method_name="SilkwormService.ClientWithdraw",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    # ---------------- 天天赚元宝与气泡元宝收取 ---------------- #

    async def get_daily_tasks(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取天天赚元宝中心任务列表与完成状态 (ActivityTaskMobileService.GetDailyTask)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "user_id": int(user_id) if user_id else 0
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.GetDailyTask",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def complete_activity_task(
        self,
        task_id: int,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """完成天天赚元宝中心指定任务 (如任务57抖音电商浏览30s) (ActivityTaskMobileService.CompleteTask)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "user_id": int(user_id) if user_id else 0,
            "task_id": int(task_id)
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.CompleteTask",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def wait_claimed_points(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取待收取的未收元宝与气泡任务明细 (ActivityTaskMobileService.WaitClaimedPoints)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.WaitClaimedPoints",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def collect_points(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """一键收取账户所有待领气泡元宝与达标任务元宝 (ActivityTask.ActivityTaskMobileService.CollectPoints)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.CollectPoints",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def user_claim_points(
        self,
        task_id: int,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """收取指定的已完成任务元宝或气泡元宝 (ActivityTaskMobileService.UserClaimPoints)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "user_id": int(user_id) if user_id else 0,
            "task_id": int(task_id)
        }
        return await self.invoke_rpc(
            server_name="ActivityTask",
            method_name="ActivityTaskMobileService.UserClaimPoints",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def draw_page_gift(
        self,
        page_gift_type: int,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """领取页面礼包 (SilkwormMobileMarketingService.DrawPageGift)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "page_gift_type": int(page_gift_type)
        }
        return await self.invoke_rpc(
            server_name="SilkwormMarketing",
            method_name="SilkwormMobileMarketingService.DrawPageGift",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_user_card_number(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取用户特权卡券数量统计 (SilkwormCardService.GetUserCardNumber)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "card_number_mode": 1,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="SilkwormCard",
            method_name="SilkwormCardService.GetUserCardNumber",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_user_card_list(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303,
        status: int = 0,
        offset: int = 0,
        number: int = 30
    ) -> Dict[str, Any]:
        """获取用户专属卡券与特权券列表 (SilkwormCardService.GetUserCardList, status: 0未使用, 1已使用, 2已过期)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "status": int(status),
            "offset": int(offset),
            "number": int(number),
            "app_id": 20
        }
        try:
            return await self.invoke_rpc(
                server_name="SilkwormCard",
                method_name="SilkwormCardService.GetUserCardList",
                body=body,
                city_code=city_code,
                token=token,
                silk_id=silk_id,
                user_id=user_id
            )
        except Exception as e:
            logger.warning(f"GetUserCardList failed: {e}")
            return {"status": {"code": 0}, "list": []}

    async def get_user_redpack_num(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303
    ) -> Dict[str, Any]:
        """获取用户可用红包总数 (RedPackService.GetUserRedPackNum)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="RedPackService",
            method_name="RedPackService.GetUserRedPackNum",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )

    async def get_app_redpack_list(
        self,
        token: str,
        silk_id: Optional[str] = None,
        user_id: Optional[str] = None,
        city_code: int = 440303,
        page: int = 1,
        page_size: int = 30
    ) -> Dict[str, Any]:
        """获取用户霸王餐红包列表 (RedPackService.GetAppRedPackList)"""
        body = {
            "silk_id": int(silk_id) if silk_id else 0,
            "page": int(page),
            "page_size": int(page_size),
            "app_id": 20
        }
        return await self.invoke_rpc(
            server_name="RedPackService",
            method_name="RedPackService.GetAppRedPackList",
            body=body,
            city_code=city_code,
            token=token,
            silk_id=silk_id,
            user_id=user_id
        )


