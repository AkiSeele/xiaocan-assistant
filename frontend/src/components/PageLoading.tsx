import React from 'react';
import { Spin } from '@douyinfe/semi-ui';

interface PageLoadingProps {
  tip?: string;
}

export const PageLoading: React.FC<PageLoadingProps> = ({ tip = '正在加载功能模块...' }) => {
  return (
    <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center justify-center gap-3">
        <Spin size="large" />
        <span className="text-sm font-medium text-semi-color-text-2 tracking-wide select-none whitespace-nowrap">
          {tip}
        </span>
      </div>
    </div>
  );
};
