"use client";

import { DeviceTab } from "../_components/device-tab";

/**
 * "Thiết bị này" — cài đặt lưu TRÊN MÁY (localStorage), không phải cài đặt chi
 * nhánh. Vì vậy nó KHÔNG gộp vào trang "In ấn": bật Trạm quầy trên máy này không
 * ảnh hưởng máy khác.
 */
export default function DeviceSettingsPage() {
  return <DeviceTab />;
}
