// lib/fareUtils.ts

/**
 * 生距離（km）を地域ごとのルールに従い切り上げる
 * 沖縄のみ、1km超～5km以下を5kmに、5km超～10km以下を10kmに切り上げる
 * 他地域は10km単位、200km超は20km単位、500km超は50km単位で切り上げ
 * @param distanceKm 生距離（km）
 * @param region 地域名（"北海道","東北",...,"沖縄"）
 * @returns 計算用に切り上げた距離（km）
 */
export function roundDistance(distanceKm: number, region: string): number {
  if (region === '沖縄') {
    if (distanceKm > 1 && distanceKm <= 5)   return 5;
    if (distanceKm > 5 && distanceKm <= 10)  return 10;
    if (distanceKm <= 200) return Math.ceil(distanceKm / 10) * 10;
    if (distanceKm <= 500) return Math.ceil(distanceKm / 20) * 20;
    return Math.ceil(distanceKm / 50) * 50;
  } else {
    if (distanceKm <= 200) return Math.ceil(distanceKm / 10) * 10;
    if (distanceKm <= 500) return Math.ceil(distanceKm / 20) * 20;
    return Math.ceil(distanceKm / 50) * 50;
  }
}