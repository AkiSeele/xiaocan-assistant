import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Skeleton } from '@douyinfe/semi-ui';
import type { ChartTrendItem } from '../../types';

interface RebateTrendChartProps {
  data: ChartTrendItem[];
  loading?: boolean;
}

export const RebateTrendChart: React.FC<RebateTrendChartProps> = ({ data, loading = false }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    const dates = data.map((d) => d.date);
    const rebates = data.map((d) => d.rebate);
    const orders = data.map((d) => d.orders);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#9CA3AF' : '#6B7280';
    const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
        borderColor: isDark ? '#374151' : '#E5E7EB',
        textStyle: {
          color: isDark ? '#F3F4F6' : '#1F2937',
          fontSize: 12,
        },
        padding: [10, 14],
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const idx = params[0].dataIndex;
          const item = data[idx];
          if (!item) return '';
          return `
            <div style="font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid ${isDark ? '#374151' : '#F3F4F6'}; padding-bottom: 4px;">
              ${item.full_date || item.date}
            </div>
            <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 3px;">
              <span style="color: #10B981; font-weight: 500;">返现收益:</span>
              <strong style="color: #10B981;">¥ ${item.rebate.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 3px;">
              <span style="color: #3B82F6; font-weight: 500;">订单单量:</span>
              <strong>${item.orders} 单</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 16px;">
              <span style="color: #8B5CF6; font-weight: 500;">外卖流水:</span>
              <span>¥ ${item.spent.toFixed(2)}</span>
            </div>
          `;
        },
      },
      legend: {
        data: ['返现收益 (元)', '订单单量 (单)'],
        top: 0,
        right: 12,
        textStyle: {
          color: textColor,
          fontSize: 12,
        },
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: {
        left: '2%',
        right: '4%',
        bottom: '3%',
        top: '18%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: {
          lineStyle: { color: gridLineColor },
        },
        axisTick: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          margin: 10,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: '金额 (元)',
          nameTextStyle: {
            color: textColor,
            fontSize: 11,
            align: 'left',
            padding: [0, 0, 4, 0],
          },
          splitLine: {
            lineStyle: {
              color: gridLineColor,
              type: 'dashed',
            },
          },
          axisLabel: {
            color: textColor,
            fontSize: 11,
            formatter: '¥{value}',
          },
        },
        {
          type: 'value',
          name: '单量 (单)',
          minInterval: 1,
          nameTextStyle: {
            color: textColor,
            fontSize: 11,
            align: 'right',
            padding: [0, 0, 4, 0],
          },
          splitLine: { show: false },
          axisLabel: {
            color: textColor,
            fontSize: 11,
            formatter: '{value}',
          },
        },
      ],
      series: [
        {
          name: '返现收益 (元)',
          type: 'line',
          yAxisIndex: 0,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: {
            color: '#10B981',
          },
          lineStyle: {
            width: 3,
            color: '#10B981',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.35)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
            ]),
          },
          data: rebates,
        },
        {
          name: '订单单量 (单)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'diamond',
          symbolSize: 6,
          itemStyle: {
            color: '#3B82F6',
          },
          lineStyle: {
            width: 2.5,
            type: 'solid',
            color: '#3B82F6',
          },
          data: orders,
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
  }, [data]);

  if (loading) {
    return (
      <div className="w-full h-64 flex flex-col justify-center p-4">
        <Skeleton.Title style={{ width: '40%', marginBottom: 16 }} />
        <Skeleton.Paragraph rows={4} style={{ marginBottom: 16 }} />
        <Skeleton.Button style={{ width: '100%', height: 32 }} />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div ref={chartRef} className="w-full h-64" />
    </div>
  );
};
