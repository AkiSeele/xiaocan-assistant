import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Skeleton, RadioGroup, Radio } from '@douyinfe/semi-ui';
import type { ChartDistributionItem } from '../../types';

interface OrderDistributionChartProps {
  statusData: ChartDistributionItem[];
  platformData: ChartDistributionItem[];
  loading?: boolean;
}

export const OrderDistributionChart: React.FC<OrderDistributionChartProps> = ({
  statusData,
  platformData,
  loading = false,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [viewType, setViewType] = useState<'status' | 'platform'>('status');

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;
    const rawData = viewType === 'status' ? statusData : platformData;
    const activeData = rawData || [];
    const total = activeData.reduce((acc, cur) => acc + (cur.value || 0), 0);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#9CA3AF' : '#6B7280';

    const defaultColors =
      viewType === 'status'
        ? ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6']
        : ['#F59E0B', '#0284C7', '#10B981', '#6366F1'];

    // 当无数据时，渲染灰色底环作为稳定占位
    const hasData = total > 0 && activeData.some((d) => d.value > 0);
    const seriesData = hasData
      ? activeData
          .filter((item) => item.value > 0)
          .map((item, idx) => ({
            name: item.name,
            value: item.value,
            itemStyle: {
              color: item.color || defaultColors[idx % defaultColors.length],
            },
          }))
      : [
          {
            name: '暂无数据',
            value: 1,
            itemStyle: {
              color: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            },
            tooltip: { show: false },
          },
        ];

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      title: {
        text: hasData ? String(total) : '0',
        subtext: viewType === 'status' ? '总订单' : '渠道总计',
        left: '34%',
        top: '38%',
        textAlign: 'center',
        textStyle: {
          fontSize: 20,
          fontWeight: 'bold',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          color: isDark ? '#F9FAFB' : '#111827',
          lineHeight: 24,
        },
        subtextStyle: {
          fontSize: 11,
          color: textColor,
        },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
        borderColor: isDark ? '#374151' : '#E5E7EB',
        textStyle: {
          color: isDark ? '#F3F4F6' : '#1F2937',
          fontSize: 12,
        },
        formatter: (params: any) => {
          if (!hasData || params.name === '暂无数据') return '';
          return `
            <div style="font-weight: 600; margin-bottom: 4px;">${params.name}</div>
            <div style="display: flex; gap: 12px; align-items: center;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${params.color};"></span>
              <span>单量: <strong>${params.value} 单</strong></span>
              <span style="color: #9CA3AF;">(${params.percent}%)</span>
            </div>
          `;
        },
      },
      legend: {
        orient: 'vertical',
        right: '4%',
        top: 'middle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 10,
        icon: 'circle',
        textStyle: {
          color: textColor,
          fontSize: 11,
        },
        formatter: (name: string) => {
          if (!hasData || name === '暂无数据') return name;
          const item = activeData.find((d) => d.name === name);
          const val = item ? item.value : 0;
          const pct = total > 0 ? ((val / total) * 100).toFixed(0) : '0';
          return `${name}  ${val}单 (${pct}%)`;
        },
      },
      series: [
        {
          name: viewType === 'status' ? '订单状态' : '平台渠道',
          type: 'pie',
          radius: ['52%', '72%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: isDark ? '#18181B' : '#FFFFFF',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          labelLine: {
            show: false,
          },
          emphasis: {
            scale: hasData,
            scaleSize: 5,
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.2)',
            },
          },
          data: seriesData,
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(chartRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
    };
  }, [statusData, platformData, viewType]);

  if (loading) {
    return (
      <div className="w-full h-56 flex flex-col justify-center p-4">
        <Skeleton.Title style={{ width: '40%', marginBottom: 14 }} />
        <Skeleton.Paragraph rows={3} style={{ marginBottom: 14 }} />
        <Skeleton.Button style={{ width: '70%', height: 28 }} />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-end mb-1.5">
        <RadioGroup
          type="button"
          value={viewType}
          onChange={(e) => setViewType(e.target.value as any)}
          buttonSize="small"
        >
          <Radio value="status">状态分布</Radio>
          <Radio value="platform">平台渠道</Radio>
        </RadioGroup>
      </div>
      <div ref={chartRef} className="w-full h-52" />
    </div>
  );
};
