/// <reference types="google.maps" />

"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { roundDistance } from "../lib/fareUtils";
import styles from './GoogleMap.module.css';

declare global {
  interface Window {
    initMap: () => void;
    google: typeof google;
  }
}

// 地域名→region_code マッピング
const regionMap: Record<string, number> = {
  北海道: 1,
  東北: 2,
  関東: 3,
  北陸信越: 4,
  中部: 5,
  近畿: 6,
  中国: 7,
  四国: 8,
  九州: 9,
  沖縄: 10,
};

// 車種キー→vehicle_code マッピング
const vehicleMap: Record<"small" | "medium" | "large" | "trailer", number> = {
  small: 1,
  medium: 2,
  large: 3,
  trailer: 4,
};

// regionごとの表示領域(bounds)
const boundsMap: Record<string, google.maps.LatLngBoundsLiteral> = {
  北海道: { north: 45.6, south: 41.2, west: 139.0, east: 146.0 },
  東北: { north: 41.2, south: 37.5, west: 139.5, east: 142.5 },
  関東: { north: 37.0, south: 35.0, west: 138.5, east: 140.5 },
  北陸信越: { north: 37.0, south: 35.5, west: 136.0, east: 139.0 },
  中部: { north: 37.5, south: 34.5, west: 136.5, east: 138.5 },
  近畿: { north: 36.0, south: 33.5, west: 134.5, east: 136.5 },
  中国: { north: 35.0, south: 32.5, west: 132.0, east: 134.0 },
  四国: { north: 34.5, south: 32.0, west: 132.0, east: 134.0 },
  九州: { north: 33.0, south: 30.5, west: 129.5, east: 131.5 },
  沖縄: { north: 26.8, south: 24.0, west: 122.9, east: 131.3 },
};

export default function GoogleMap() {
  const [vehicle, setVehicle] = useState<"small" | "medium" | "large" | "trailer">("large");
  const [region, setRegion] = useState<string>("関東");
  const [useHighway, setUseHighway] = useState<boolean>(true);
  const [rawKm, setRawKm] = useState<number | null>(null);
  const [roundedKm, setRoundedKm] = useState<number | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [originAddr, setOriginAddr] = useState<string>("");
  const [destinationAddr, setDestinationAddr] = useState<string>("");

  // メニュー表示用 state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [clickedLatLng, setClickedLatLng] = useState<google.maps.LatLngLiteral | null>(null);

  const originRef = useRef<google.maps.LatLngLiteral | null>(null);
  const destinationRef = useRef<google.maps.LatLngLiteral | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null); // ← 追加
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  // 地図初期化
  useEffect(() => {
    // ピンチズームを防ぐイベントリスナー追加
    const preventPinchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventPinchZoom, { passive: false });

    if (!mapRef.current || !window.google || mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 37, lng: 138 },
      zoom: 6,
      mapTypeId: "roadmap",
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy", // 地図のみジェスチャーを受け付ける
    });
    mapInstanceRef.current = map;

    const renderer = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#0000FF" },
      preserveViewport: true,
    });
    directionsRendererRef.current = renderer;

    // クリックでメニュー表示
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const ev = e.domEvent as MouseEvent;
      setMenuPos({ x: ev.clientX, y: ev.clientY });
      setClickedLatLng({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      setMenuOpen(true);
    });

    // クリーンアップ関数でイベントリスナーを削除
    return () => {
      document.removeEventListener('touchmove', preventPinchZoom);
    };
  }, []);

  // 地域変更で Bounds fit
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = boundsMap[region];
    if (!bounds) return;
    map.fitBounds(bounds, { top: 16, right: 16, bottom: 16, left: 16 });
  }, [region]);

  // マーカー追加
  const addMarker = (pos: google.maps.LatLngLiteral, color: "blue" | "red") => {
    const marker = new window.google.maps.Marker({
      position: pos,
      map: directionsRendererRef.current!.getMap()!,
      icon: {
        url: `http://maps.google.com/mapfiles/ms/icons/${color}-dot.png`,
        scaledSize: new window.google.maps.Size(32, 32),
        anchor: new window.google.maps.Point(16, 32),
      },
    });
    markersRef.current.push(marker);
  };

  // マーカー消去
  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    // destinationMarkerRef は消さない
  };

  // 運賃計算＋ルート表示
  const handleCalcFare = useCallback(async () => {
    const origin = originRef.current,
      dest = destinationRef.current;
    if (!origin || !dest) {
      alert("出発地と目的地をクリックで指定してください");
      return;
    }

    new window.google.maps.DirectionsService().route(
      {
        origin,
        destination: dest,
        travelMode: window.google.maps.TravelMode.DRIVING,
        avoidHighways: !useHighway,
        avoidFerries: true,
      },
      async (result, status) => {
        if (status !== "OK" || !result) {
          alert("ルート取得エラー：" + status);
          return;
        }
        // フェリー区間を除外
        const leg = result.routes[0].legs[0];
        const isStartHokkaido = leg.start_address.includes("北海道");
        const isEndHokkaido = leg.end_address.includes("北海道");
        if (isStartHokkaido !== isEndHokkaido) {
          alert("北海道⇔本州フェリー区間は計算できません");
          return;
        }
        const landOnly = result.routes.find((r) =>
          !r.legs.some((l) =>
            l.steps.some((s) => (s.instructions || "").includes("フェリー"))
          )
        );
        if (!landOnly) {
          alert("「高速道路を利用する」にチェックして再計算してください");
          return;
        }

        directionsRendererRef.current!.setDirections({
          ...result,
          routes: [landOnly],
        });

        const km = landOnly.legs[0].distance!.value / 1000;
        setRawKm(km);
        setOriginAddr(leg.start_address.replace(/^日本、,?\s*/, ""));
        setDestinationAddr(leg.end_address.replace(/^日本、,?\s*/, ""));
        const rkm = roundDistance(km, region);
        setRoundedKm(rkm);

        const { data, error } = await supabase
          .from("fare_rates")
          .select("fare_yen")
          .eq("region_code", regionMap[region])
          .eq("vehicle_code", vehicleMap[vehicle])
          .eq("upto_km", rkm)
          .maybeSingle();
        if (error || !data) {
          alert("運賃計算できません");
          return;
        }
        setFare(data.fare_yen);
      }
    );
  }, [useHighway, vehicle, region]);

  return (
    <div className={styles.container}>
      {/* 操作パネル */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#000' }}>車種</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(["small", "medium", "large", "trailer"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVehicle(v)}
                style={{
                  padding: '8px 16px',
                  border: '2px solid #0066cc',
                  borderRadius: '4px',
                  backgroundColor: vehicle === v ? '#0066cc' : 'white',
                  color: vehicle === v ? 'white' : '#0066cc',
                  cursor: 'pointer',
                  fontWeight: vehicle === v ? 'bold' : 'normal',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (vehicle !== v) {
                    e.currentTarget.style.backgroundColor = '#e6f2ff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (vehicle !== v) {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                {{
                  small: "小型車(2t)",
                  medium: "中型車(4t)",
                  large: "大型車(10t)",
                  trailer: "トレーラー(20t)",
                }[v]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#000' }}>届出の利用運輸局</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(
              ["北海道", "東北", "関東", "北陸信越", "中部", "近畿", "中国", "四国", "九州", "沖縄"] as string[]
            ).map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                style={{
                  padding: '8px 16px',
                  border: '2px solid #00aa00',
                  borderRadius: '4px',
                  backgroundColor: region === r ? '#00aa00' : 'white',
                  color: region === r ? 'white' : '#00aa00',
                  cursor: 'pointer',
                  fontWeight: region === r ? 'bold' : 'normal',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (region !== r) {
                    e.currentTarget.style.backgroundColor = '#e6ffe6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (region !== r) {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button
            onClick={() => setUseHighway(!useHighway)}
            style={{
              padding: '8px 16px',
              border: '2px solid #aa00aa',
              borderRadius: '4px',
              backgroundColor: useHighway ? '#aa00aa' : 'white',
              color: useHighway ? 'white' : '#aa00aa',
              cursor: 'pointer',
              fontWeight: useHighway ? 'bold' : 'normal',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!useHighway) {
                e.currentTarget.style.backgroundColor = '#ffe6ff';
              }
            }}
            onMouseLeave={(e) => {
              if (!useHighway) {
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            高速道路を利用する
          </button>
        </div>
      </div>

      {/* 地図 */}
      <div ref={mapRef} style={{ width: "100%", height: "400px", position: "relative" }} />

      {/* 選択メニュー */}
      {menuOpen && menuPos && clickedLatLng && (
        <div
          style={{
            position: "absolute",
            top: menuPos.y,
            left: menuPos.x,
            background: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            borderRadius: 4,
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            padding: "4px",
          }}
        >
          <button
            style={{ 
              color: "#0066cc",
              backgroundColor: "white",
              border: "none",
              padding: "8px 16px",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "4px",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#e6f2ff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "white";
            }}
            onClick={() => {
              originRef.current = clickedLatLng;
              clearMarkers();
              addMarker(clickedLatLng, "blue");
              setMenuOpen(false);
            }}
          >
            出発地に設定
          </button>
          <button
            style={{ 
              color: "#cc0000",
              backgroundColor: "white",
              border: "none",
              padding: "8px 16px",
              textAlign: "left",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "4px",
              marginTop: "4px",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#ffe6e6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "white";
            }}
            onClick={() => {
              if (!originRef.current) {
                alert("先に出発地を設定してください");
                return;
              }
              // ① 既存の赤マーカーだけ消す
              if (destinationMarkerRef.current) {
                destinationMarkerRef.current.setMap(null);
              }
              // ② destinationRef を上書き
              destinationRef.current = clickedLatLng;
              // ③ 新しい赤マーカーを作って保存
              const m = new window.google.maps.Marker({
                position: clickedLatLng,
                map: directionsRendererRef.current!.getMap()!,
                icon: {
                  url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                  scaledSize: new window.google.maps.Size(32, 32),
                  anchor: new window.google.maps.Point(16, 32),
                },
              });
              destinationMarkerRef.current = m;
              setMenuOpen(false);
            }}
          >
            到着地に設定
          </button>
        </div>
      )}

      {/* 計算ボタン */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
        <button 
          onClick={handleCalcFare} 
          style={{ 
            padding: "12px 24px",
            fontSize: "16px",
            fontWeight: "bold",
            border: "none",
            borderRadius: "4px",
            backgroundColor: originRef.current && destinationRef.current ? "#0066cc" : "#cccccc",
            color: "white",
            cursor: originRef.current && destinationRef.current ? "pointer" : "not-allowed",
            transition: "background-color 0.3s ease",
          }}
          disabled={!originRef.current || !destinationRef.current}
        >
          標準的運賃（概算）を計算する
        </button>
      </div>

      {/* 結果表示 */}
      {fare != null && (
        <div
          style={{
            border: "1px solid #000",
            borderRadius: 12,
            padding: 16,
            marginTop: 24,
            maxWidth: 600,
            fontSize: 14,
            color: '#000',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 24, color: '#000' }}>
            基準運賃額
            <span style={{ marginLeft: "10mm", fontWeight: "bold", fontSize: 28, color: '#000' }}>
              ¥{fare.toLocaleString()}
            </span>
            <small style={{ marginLeft: 8, fontSize: 12, color: '#555' }}>
              （高速道路料金及び消費税を含みません）
            </small>
          </h2>
          <dl style={{ margin: "12px 0", lineHeight: 1.5, overflow: "hidden", color: '#000' }}>
            <dt style={{ float: "left", clear: "left", width: 120, color: '#000' }}>出発地：住所</dt>
            <dd style={{ marginLeft: 120, color: '#000' }}>{originAddr}</dd>
            <dt style={{ float: "left", clear: "left", width: 120, color: '#000' }}>到着地：住所</dt>
            <dd style={{ marginLeft: 120, color: '#000' }}>{destinationAddr}</dd>
            <dt style={{ float: "left", clear: "left", width: 120, color: '#000' }}>経路上の距離</dt>
            <dd style={{ marginLeft: 120, color: '#000' }}>{rawKm!.toFixed(1)}km</dd>
            <dt style={{ float: "left", clear: "left", width: 120, color: '#000' }}>運賃計算距離</dt>
            <dd style={{ marginLeft: 120, color: '#000' }}>{roundedKm}km</dd>
            <dt style={{ float: "left", clear: "left", width: 120, color: '#000' }}>高速道路利用</dt>
            <dd style={{ marginLeft: 120, color: '#000' }}>{useHighway ? "利用する" : "利用しない"}</dd>
            <dt style={{ float: "left", clear: "left", width: 120, color: '#000' }}>車種</dt>
            <dd style={{ marginLeft: 120, color: '#000' }}>
              {{
                small: "小型車(2t)",
                medium: "中型車(4t)",
                large: "大型車(10t)",
                trailer: "トレーラー(20t)",
              }[vehicle]}
            </dd>
            <dt style={{ float: "left", clear: "left", width: 120, color: '#000' }}>届出：運輸局</dt>
            <dd style={{ marginLeft: 120, color: '#000' }}>{region}運輸局</dd>
          </dl>
        </div>
      )}

      {/* 注意書き */}
      <div
        style={{
          marginTop: 24,
          padding: "0 16px",
          fontSize: 12,
          lineHeight: 1.6,
          color: "#555",
          maxWidth: 600,
        }}
      >

        <p>● 標準的運賃は、令和６年国土交通省告示第209号（2024年3月22日）を踏まえ算出されます。</p>
        <p>● 青色ピンは出発地、赤色ピンは到着地です。</p>
        <p>● 算出される距離と実際の走行距離に誤差が発生する場合があります。</p>
        <p>● 地図データの状況により出発地住所が取得できない場合は、近隣エリアを起点・終点として算出します。</p>
        <p>● フェリー区間がある場合、「高速道路を利用する」を選択してください。</p>
        <p>● 算出額は、概算額であり、正確性が確保できない場合があります。</p>
        <p>◆ 計算システムの提供：公益社団法人全日本トラック協会</p>
        <p>◆ 利用方法のお問合せ：日本ＰＭＩコンサルティング株式会社　メールアドレス：st@jta.support</p>      </div>
    </div>
  );
}