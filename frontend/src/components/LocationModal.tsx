import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Input,
  Tag,
  Button,
  Dropdown,
  Toast
} from '@douyinfe/semi-ui';
import {
  IconDesktop,
  IconSearch,
  IconRefresh
} from '@douyinfe/semi-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api';
import type { LocationCandidate } from '../types';

interface LocationModalProps {
  visible: boolean;
  onClose: () => void;
}

const formatCityTag = (rawCity?: string) => {
  if (!rawCity) return '未知';
  return rawCity
    .replace(/(特别行政区|自治区|自治州|地区|盟|市|省)$/, '')
    .trim() || rawCity;
};

export const LocationModal: React.FC<LocationModalProps> = ({ visible, onClose }) => {
  const activeLocation = useAppStore((s) => s.activeLocation);
  const setActiveLocation = useAppStore((s) => s.setActiveLocation);

  const [editLng, setEditLng] = useState<string>(activeLocation.longitude);
  const [editLat, setEditLat] = useState<string>(activeLocation.latitude);
  const [resolvedCityCode, setResolvedCityCode] = useState<number>(activeLocation.cityCode);
  const [resolvedCityName, setResolvedCityName] = useState<string>(activeLocation.cityName);
  const [resolvedAddress, setResolvedAddress] = useState<string>(activeLocation.addressName);

  const [resolving, setResolving] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);

  // 搜索关键词与浮层下拉状态
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [candidates, setCandidates] = useState<LocationCandidate[]>([]);
  const [dropdownVisible, setDropdownVisible] = useState<boolean>(false);

  // 动态测量搜索栏宽度，确保下拉浮层与搜索栏 1:1 像素级精准对齐
  const searchRowRef = useRef<HTMLDivElement>(null);
  const [menuWidth, setMenuWidth] = useState<number>(532);

  const updateMenuWidth = () => {
    if (searchRowRef.current) {
      const w = searchRowRef.current.offsetWidth;
      if (w > 0) {
        setMenuWidth(w);
      }
    }
  };

  useEffect(() => {
    if (visible) {
      setEditLng(activeLocation.longitude);
      setEditLat(activeLocation.latitude);
      setResolvedCityCode(activeLocation.cityCode);
      setResolvedCityName(activeLocation.cityName);
      setResolvedAddress(activeLocation.addressName);
      setSearchKeyword('');
      setCandidates([]);
      setDropdownVisible(false);

      // 弹窗渲染挂载后测量实际宽度
      updateMenuWidth();
      const t1 = setTimeout(updateMenuWidth, 50);
      const t2 = setTimeout(updateMenuWidth, 180);
      window.addEventListener('resize', updateMenuWidth);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        window.removeEventListener('resize', updateMenuWidth);
      };
    } else {
      setDropdownVisible(false);
    }
  }, [visible, activeLocation]);

  // 反查经纬度对应地址
  const handleResolveCoords = async (latStr?: string, lngStr?: string, showToast = true) => {
    const targetLat = String(latStr ?? editLat ?? '').trim();
    const targetLng = String(lngStr ?? editLng ?? '').trim();
    const latVal = parseFloat(targetLat);
    const lngVal = parseFloat(targetLng);

    if (isNaN(latVal) || isNaN(lngVal)) {
      if (showToast) Toast.error('请输入有效的经纬度数值');
      return false;
    }

    setResolving(true);
    try {
      const res = await api.resolveLocation(latVal, lngVal);
      if (res && res.ok && res.city_name) {
        setResolvedCityCode(res.city_code || 420100);
        setResolvedCityName(res.city_name);
        setResolvedAddress(res.address_name || `${res.city_name}市`);
        if (showToast) {
          Toast.success(`解析成功：${res.city_name} · ${res.address_name}`);
        }
        return true;
      } else {
        if (showToast) Toast.warning('未解析到该坐标的地址信息');
        return false;
      }
    } catch {
      if (showToast) Toast.error('反查地址失败，请检查网络');
      return false;
    } finally {
      setResolving(false);
    }
  };

  // 选中某一个候选地址项
  const handleSelectCandidate = (cand: LocationCandidate) => {
    setEditLng(cand.longitude);
    setEditLat(cand.latitude);
    setResolvedCityCode(cand.city_code || 420100);
    setResolvedCityName(cand.city_name);
    setResolvedAddress(cand.full_address || `${cand.city_name} · ${cand.short_name}`);
    setDropdownVisible(false);
    Toast.success(`已切换：${cand.city_name} · ${cand.short_name}`);
  };

  // 仅在用户主动按 Enter 或点击【搜索】时单次触发检索 (严禁打字实时触发)
  const handleExecuteSearch = async () => {
    const cleanKw = (searchKeyword || '').trim();
    if (!cleanKw) {
      Toast.warning('请输入搜索关键词');
      return;
    }
    setSearching(true);
    try {
      const res = await api.searchLocation(cleanKw);
      if (res && res.ok && res.candidates && res.candidates.length > 0) {
        if (res.candidates.length === 1) {
          // 单条候选直接应用，无需下拉点选
          handleSelectCandidate(res.candidates[0]);
          setDropdownVisible(false);
        } else {
          // 多条候选展开浮层下拉菜单供用户点选，提前同步宽度
          updateMenuWidth();
          setCandidates(res.candidates);
          setDropdownVisible(true);
        }
      } else {
        setCandidates([]);
        setDropdownVisible(false);
        Toast.info('未找到匹配地点，请尝试输入更详细的地址或城市名');
      }
    } catch {
      setCandidates([]);
      setDropdownVisible(false);
      Toast.error('检索失败，请重试');
    } finally {
      setSearching(false);
    }
  };

  // 读取本机定位 (核心重点功能)
  const handleGetDeviceLocation = () => {
    setLocating(true);
    const fallbackToIp = async () => {
      try {
        const ipRes = await api.getIpLocation();
        if (ipRes && ipRes.ok && ipRes.latitude && ipRes.longitude) {
          setEditLng(ipRes.longitude);
          setEditLat(ipRes.latitude);
          setResolvedCityCode(ipRes.city_code || 420100);
          setResolvedCityName(ipRes.city_name);
          setResolvedAddress(ipRes.address_name || `${ipRes.city_name}市`);
          Toast.success(`已成功获取定位：${ipRes.city_name} · ${ipRes.address_name}`);
        } else {
          Toast.error('获取定位失败，请尝试搜索地址');
        }
      } catch {
        Toast.error('定位服务暂时不可用，请尝试搜索地址');
      } finally {
        setLocating(false);
      }
    };

    if (!navigator.geolocation) {
      fallbackToIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setEditLng(lng.toFixed(6));
        setEditLat(lat.toFixed(6));
        try {
          const res = await api.resolveLocation(lat, lng);
          if (res && res.ok && res.city_name) {
            setResolvedCityCode(res.city_code || 420100);
            setResolvedCityName(res.city_name);
            setResolvedAddress(res.address_name || `${res.city_name}市`);
            Toast.success(`已成功获取高精定位：${res.city_name} · ${res.address_name}`);
          } else {
            fallbackToIp();
          }
        } catch {
          fallbackToIp();
        } finally {
          setLocating(false);
        }
      },
      () => fallbackToIp(),
      { timeout: 5000, enableHighAccuracy: true }
    );
  };

  // 确认保存
  const handleConfirmLocation = async () => {
    const latVal = parseFloat(editLat);
    const lngVal = parseFloat(editLng);

    if (isNaN(latVal) || isNaN(lngVal)) {
      Toast.error('请输入有效的经度和纬度');
      return;
    }

    let cName = resolvedCityName;
    let cCode = resolvedCityCode;
    let addr = resolvedAddress;

    if (!addr || !cName) {
      try {
        const res = await api.resolveLocation(latVal, lngVal);
        if (res && res.ok && res.city_name) {
          cName = res.city_name;
          cCode = res.city_code || 420100;
          addr = res.address_name || `${res.city_name}市`;
        }
      } catch {
        // ignore
      }
    }

    const newLoc = {
      cityCode: cCode || 420100,
      cityName: cName || '未知城市',
      addressName: addr || '高精定位点',
      longitude: (editLng || '').trim(),
      latitude: (editLat || '').trim()
    };

    setActiveLocation(newLoc);
    Toast.success(`抢单位置已更新：${newLoc.cityName} · ${newLoc.addressName}`);
    onClose();
  };

  return (
    <Modal
      title="抢单位置设置"
      visible={visible}
      onOk={handleConfirmLocation}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      width={580}
      centered
    >
      <div className="space-y-3.5 py-1">
        {/* 1. 当前位置展示与一键获取本机定位 (重点核心卡片) */}
        <div className="p-3.5 rounded-xl bg-semi-color-fill-0 border border-semi-color-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-semi-color-text-0">当前位置</span>
              <Tag size="small" color="blue" className="shrink-0 font-normal">{formatCityTag(resolvedCityName)}</Tag>
            </div>
            <Button
              theme="solid"
              type="primary"
              icon={<IconDesktop />}
              loading={locating}
              onClick={handleGetDeviceLocation}
              onMouseDown={(e) => e.preventDefault()}
              size="small"
            >
              获取本机定位
            </Button>
          </div>
          <div className="text-sm font-semibold text-semi-color-text-0 leading-relaxed truncate" title={resolvedAddress}>
            {resolvedAddress || '未解析地址'}
          </div>
          <div className="text-[11px] text-semi-color-text-2 font-mono">
            坐标: {editLng || '0.000000'}, {editLat || '0.000000'}
          </div>
        </div>

        {/* 2. 搜索其他地址 (采用 Dropdown 浮层下拉，与搜索栏 100% 等宽对齐，弹窗高度全程不改变) */}
        <Dropdown
          trigger="custom"
          visible={dropdownVisible}
          onClickOutSide={() => setDropdownVisible(false)}
          position="bottomLeft"
          zIndex={1060}
          spacing={6}
          style={{ width: `${menuWidth}px` }}
          render={
            <Dropdown.Menu
              style={{
                width: `${menuWidth}px`,
                minWidth: `${menuWidth}px`,
                maxWidth: `${menuWidth}px`,
                maxHeight: 320,
                overflowY: 'auto'
              }}
            >
              <Dropdown.Title className="text-xs text-semi-color-text-2 font-normal pb-1">
                搜索候选地点 (找到 {candidates.length} 个匹配地点，点击切换)
              </Dropdown.Title>
              {candidates.map((cand, idx) => (
                <Dropdown.Item
                  key={`${cand.city_name}-${cand.latitude}-${cand.longitude}-${idx}`}
                  onClick={() => handleSelectCandidate(cand)}
                  style={{ maxWidth: 'none', width: '100%', padding: '10px 16px', boxSizing: 'border-box' }}
                  className="!max-w-none !w-full"
                >
                  <div className="flex items-center gap-3 py-0.5 w-full min-w-0">
                    <Tag size="small" color="blue" className="shrink-0 font-normal">
                      {formatCityTag(cand.city_name)}
                    </Tag>
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="text-xs text-semi-color-text-0 font-medium truncate">
                        {cand.short_name || cand.full_address}
                      </div>
                      <div
                        className="text-[11px] text-semi-color-text-2 truncate"
                        title={cand.full_address}
                      >
                        {cand.full_address}
                      </div>
                    </div>
                  </div>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          }
        >
          <div ref={searchRowRef} className="flex gap-2 w-full">
            <Input
              value={searchKeyword}
              placeholder="搜索其他地址或地标 (如: 荣生大厦 / 万象天地)"
              prefix={<IconSearch />}
              showClear
              onChange={(val) => {
                setSearchKeyword(val);
                if (dropdownVisible) setDropdownVisible(false);
              }}
              onEnterPress={handleExecuteSearch}
              className="flex-1"
            />
            <Button
              type="primary"
              theme="light"
              loading={searching}
              icon={<IconSearch />}
              onClick={handleExecuteSearch}
              onMouseDown={(e) => e.preventDefault()}
              className="shrink-0"
            >
              搜索
            </Button>
          </div>
        </Dropdown>

        {/* 3. 辅助微调区：经纬度弱化微调 (单行紧凑，视觉弱化) */}
        <div className="pt-2 border-t border-semi-color-border/60 flex items-center justify-between gap-2 text-xs text-semi-color-text-2">
          <div className="flex items-center gap-1.5 flex-1">
            <span className="text-semi-color-text-2 shrink-0 text-[11px]">坐标微调:</span>
            <Input
              value={editLng}
              placeholder="经度"
              size="small"
              className="w-28 text-[11px] font-mono"
              onChange={(val) => setEditLng(val)}
            />
            <Input
              value={editLat}
              placeholder="纬度"
              size="small"
              className="w-28 text-[11px] font-mono"
              onChange={(val) => setEditLat(val)}
            />
          </div>
          <Button
            size="small"
            theme="borderless"
            type="tertiary"
            icon={<IconRefresh />}
            loading={resolving}
            onClick={() => handleResolveCoords(editLat, editLng, true)}
            onMouseDown={(e) => e.preventDefault()}
            className="shrink-0 text-[11px]"
          >
            反查地址
          </Button>
        </div>
      </div>
    </Modal>
  );
};
