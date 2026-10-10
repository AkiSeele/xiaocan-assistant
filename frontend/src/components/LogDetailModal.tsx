import React from 'react';
import {
  Modal,
  Typography,
  Tag,
  Button,
  Space,
  Avatar,
  Toast
} from '@douyinfe/semi-ui';
import {
  IconCopy,
  IconList,
  IconSpin
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { TaskIcon } from './TaskIcons';
import type { JobLog } from '../types';

const { Text } = Typography;

const TASK_LABELS: Record<string, string> = {
  // 霸王餐抢单与预约
  store_grab: '霸王餐即时抢单',
  store_appoint: '倒计时预约抢单',
  store_monitor: '实时名额监听捡漏',
  store_keyword: '商户定时搜索捡漏',
  store_search: '商户定向搜索捡漏',
  store_cancel: '霸王餐名额取消',

  // 日常自动化任务
  user_sign: '每日签到打卡',
  sign_in_lottery: '天天赚元宝抽奖',
  vip_task: '会员日常成长任务',
  brand_flash: 'SVIP大牌神券秒杀',
  svip_rebate: 'SVIP专属返利券秒杀',
  free_order: '全平台免单券秒杀',
  media_vip: '腾讯/网易影视周卡秒杀',
  flash_sale: '元宝秒杀券兑换',
  daily_redpack: '每日全平台红包雨',
  lottery: '免费开红包与抽奖',
  step_reward: '阶段阶梯打卡进度领取',
  auto_withdraw: '账户佣金自动提现',
  check_assets: '全资产与明细轮询',
  token_refresh: '多账号鉴权状态巡检'
};

export interface LogDetailModalProps {
  visible: boolean;
  onClose: () => void;
  log?: JobLog | null;
  // 支持手动传入非 JobLog 对象的参数
  customTitle?: string;
  customTaskId?: string;
  customAccountKey?: string;
  customCreatedAt?: string;
  customStatus?: string;
  customOutput?: string;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({
  visible,
  onClose,
  log,
  customTitle,
  customTaskId,
  customAccountKey,
  customCreatedAt,
  customStatus,
  customOutput
}) => {
  const accounts = useAppStore((s) => s.accounts);

  const taskId = customTaskId || log?.task_id || '';
  const taskName = customTitle || TASK_LABELS[taskId] || (taskId ? `任务 [${taskId}]` : '调度任务');
  const accountKey = customAccountKey || log?.account_key || '';
  const matchedAccount = accounts.find((a) => a.key === accountKey);
  const accountNickname = matchedAccount?.nickname || accountKey || '默认账号';
  const createdAt = customCreatedAt || log?.created_at || '-';
  const status = customStatus || log?.status || 'success';
  const output = customOutput !== undefined ? customOutput : (log?.output || '');

  const handleCopy = () => {
    if (!output) {
      Toast.warning('当前无日志可复制');
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(output).then(
        () => Toast.success('已复制全部日志到剪贴板'),
        () => Toast.error('复制失败，请手动选中文本复制')
      );
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = output;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        Toast.success('已复制全部日志到剪贴板');
      } catch {
        Toast.error('复制失败，请手动复制');
      }
      document.body.removeChild(textarea);
    }
  };

  const isRunning = status === 'running';
  const isSuccess = status === 'success';

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          {taskId && <TaskIcon taskId={taskId} className="w-5 h-5 shrink-0" />}
          <span className="font-semibold text-semi-color-text-0">日志详情 - [{taskName}]</span>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <div className="flex justify-between items-center w-full">
          <Button
            theme="light"
            type="tertiary"
            icon={<IconCopy />}
            onClick={handleCopy}
          >
            复制全部日志
          </Button>
          <Button theme="solid" type="primary" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
      width={680}
      centered
    >
      <div className="space-y-3 pt-1">
        {/* 元信息条 */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-semi-color-fill-0 border border-semi-color-border text-xs">
          <Space>
            <Text type="secondary">执行时间：</Text>
            <span className="font-mono text-semi-color-text-0">{createdAt}</span>
          </Space>
          <Space>
            <Text type="secondary">执行账号：</Text>
            <div className="flex items-center gap-1.5">
              <Avatar
                size="extra-extra-small"
                src={matchedAccount?.avatar || undefined}
                color="orange"
                className="shrink-0"
              >
                {matchedAccount?.nickname?.[0] || '用'}
              </Avatar>
              <span className="font-semibold text-semi-color-text-0 truncate max-w-[150px]">
                {accountNickname}
              </span>
            </div>
          </Space>
          <Space>
            <Text type="secondary">状态：</Text>
            <Tag
              color={isRunning ? 'blue' : isSuccess ? 'green' : 'red'}
              size="small"
              prefixIcon={isRunning ? <IconSpin spin /> : undefined}
            >
              {isRunning ? '正在执行中' : isSuccess ? '执行成功' : '执行异常'}
            </Tag>
          </Space>
        </div>

        {/* 步骤流水结构化可视化解析 */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-semi-color-text-1 font-medium">
            <IconList size="small" />
            <span>详细执行步骤过程：</span>
          </div>
          <div className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-xl font-mono text-[12px] max-h-[380px] overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner select-text">
            {output ? (
              output.split('\n').map((line, idx) => {
                const lineIsStep = line.includes('步骤') || line.includes('场次') || line.includes('阶段');
                const lineIsSuccess = line.includes('成功') || line.includes('达成');
                const lineIsError = line.includes('失败') || line.includes('异常') || line.includes('未成功') || line.includes('代码:');
                const lineIsRunning = line.includes('正在') || line.includes('检测') || line.includes('预热') || line.includes('持续') || line.includes('嗅探');

                let color = '#d4d4d4';
                if (lineIsStep) color = '#79b8ff';
                else if (lineIsSuccess) color = '#7ee787';
                else if (lineIsError) color = '#ff7b72';
                else if (lineIsRunning) color = '#f9d770';

                return (
                  <div key={idx} style={{ color }} className="py-0.5">
                    {line}
                  </div>
                );
              })
            ) : (
              <span className="text-gray-500">无日志内容</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
