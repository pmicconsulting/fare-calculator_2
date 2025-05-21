/// <reference types="google.maps" />

"use client";

import React, { useRef, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { roundDistance } from "../lib/fareUtils";

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
  北海道:   { north: 45.6, south: 41.2, west: 139.0, east: 146.0 },
  東北:     { north: 41.2, south: 37.5, west: 139.5, east: 142.5 },
  関東:     { north: 37.0, south: 35.0, west: 138.5, east: 140.5 },
  北陸信越: { north: 37.0, south: 35.5, west: 136.0, east: 139.0 },
  中部:     { north: 37.5, south: 34.5, west: 136.5, east: 138.5 },
  近畿:     { north: 36.0, south: 33.5, west: 134.5, east: 136.5 },
  中国:     { north: 35.0, south: 32.5, west: 132.0, east: 134.0 },
  四国:     { north: 34.5, south: 32.0, west: 132.0, east: 134.0 },
  九州:     { north: 33.0, south: 30.5, west: 129.5, east: 131.5 },
  沖縄:     { north: 26.8, south: 24.0, west: 122.9, east: 131.3 },
};

export default function GoogleMap() {
  const [vehicle, setVehicle] = useState<"small"|"medium"|"large"|"trailer">("small");
  const [region, setRegion] = useState<string>("北海道");
  const [useHighway, setUseHighway] = useState<boolean>(false);
  const [rawKm, setRawKm] = useState<number|null>(null);
  const [roundedKm, setRoundedKm] = useState<number|null>(null);
  const [fare, setFare] = useState<number|null>(null);
  const [originAddr, setOriginAddr] = useState<string>("");
  const [destinationAddr, setDestinationAddr] = useState<string>("");

  const originRef = useRef<google.maps.LatLngLiteral|null>(null);
  const destinationRef = useRef<google.maps.LatLngLiteral|null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map|null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer|null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  // 地図初期化
  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 37, lng: 138 },
      zoom: 6,
      mapTypeId: "roadmap",
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapInstanceRef.current = map;

    const renderer = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#0000FF" },
      preserveViewport: true,
    });
    directionsRendererRef.current = renderer;

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      if (!originRef.current) {
        originRef.current = pos;
        clearMarkers();
        addMarker(pos, "origin");
      } else if (!destinationRef.current) {
        destinationRef.current = pos;
        addMarker(pos, "destination");
      } else {
        originRef.current = pos;
        destinationRef.current = null;
        setRawKm(null);
        setRoundedKm(null);
        setFare(null);
        // ------- 修正点 -------
        // 空の DirectionsResult を直接 cast すると型エラーになるため、
        // 一度 unknown 経由でキャストします
        directionsRendererRef.current!.setDirections(
          ({ routes: [] } as unknown) as google.maps.DirectionsResult
        );
        // ----------------------
        clearMarkers();
        addMarker(pos, "origin");
      }
    });
  }, []);

  // region変更で表示領域フィット
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = boundsMap[region];
    if (!bounds) return;
    map.fitBounds(bounds, { top: 16, right: 16, bottom: 16, left: 16 });
  }, [region]);

  // マーカー追加
  const addMarker = (pos: google.maps.LatLngLiteral, type: "origin"|"destination") => {
    const url = type==="origin" ? "/origin-pin.png" : "/destination-pin.png";
    const marker = new window.google.maps.Marker({
      position: pos,
      map: directionsRendererRef.current!.getMap()!,
      icon: {
        url,
        scaledSize: new window.google.maps.Size(48,48),
        anchor: new window.google.maps.Point(24,48),
      },
    });
    markersRef.current.push(marker);
  };

  // マーカー消去
  const clearMarkers = () => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
  };

  // 運賃計算＋ルート表示
  const handleCalcFare = () => {
    const origin = originRef.current, dest = destinationRef.current;
    if (!origin || !dest) {
      alert("出発地と到着地をクリックで指定してください");
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
        if (status!=="OK" || !result) {
          alert("ルート取得エラー：" + status);
          return;
        }
        const leg = result.routes[0].legs[0];
        const sh = leg.start_address.includes("北海道");
        const eh = leg.end_address.includes("北海道");
        if (sh!==eh) {
          alert("北海道⇔本州フェリー区間は計算できません");
          return;
        }
        const landOnly = result.routes.find(r =>
          !r.legs.some(l =>
            l.steps.some(s =>
              (s.instructions||"").includes("フェリー")
            )
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
        setOriginAddr(leg.start_address.replace(/^日本、,?\s*/,""));
        setDestinationAddr(leg.end_address.replace(/^日本、,?\s*/,""));
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
  };

  return (
    <div>
      {/* 操作パネル */}
      <div style={{ marginBottom:12 }}>
        <fieldset>
          <legend>車種</legend>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"8px 16px" }}>
            {(["small","medium","large","trailer"] as const).map(v=>(
              <label key={v}>
                <input
                  type="radio"
                  name="vehicle"
                  value={v}
                  checked={vehicle===v}
                  onChange={()=>setVehicle(v)}
                />
                {{small:"小型車(2t)",medium:"中型車(4t)",large:"大型車(10t)",trailer:"トレーラ(20t)"}[v]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ marginTop:8 }}>
          <legend>届出の利用運輸局</legend>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"8px 16px" }}>
            {(["北海道","東北","関東","北陸信越","中部","近畿","中国","四国","九州","沖縄"] as string[]).map(r=>(
              <label key={r}>
                <input
                  type="radio"
                  name="region"
                  value={r}
                  checked={region===r}
                  onChange={()=>setRegion(r)}
                />
                {r}
              </label>
            ))}
          </div>
        </fieldset>

        <div style={{ marginTop:8 }}>
          <label>
            <input
              type="checkbox"
              checked={useHighway}
              onChange={e=>setUseHighway(e.target.checked)}
            /> 高速道路を利用する
          </label>
        </div>
      </div>

      {/* 地図 */}
      <div ref={mapRef} style={{ width:"100%", height:"400px" }} />

      {/* 計算ボタン */}
      <div style={{ display:"flex", justifyContent:"center", marginTop:12 }}>
        <button onClick={handleCalcFare} style={{ padding:"8px 12px" }}>
          標準的運賃を計算する
        </button>
      </div>

      {/* 結果表示 */}
      {fare!=null && (
        <div style={{
          border:"1px solid #000", borderRadius:12, padding:16,
          marginTop:24, maxWidth:600, fontSize:14
        }}>
          <h2 style      ={{ margin:0, fontSize:24 }}>
            基準運賃額
            <span style={{ marginLeft:"10mm", fontWeight:"bold", fontSize:28 }}>
              ¥{fare.toLocaleString()}
            </span>
            <small style={{ marginLeft:8,fontSize:12,color:"#555" }}>
              （高速道路料金及び消費税を含みません）
            </small>
          </h2>
          <dl style={{ margin:"12px 0",lineHeight:1.5,overflow:"hidden" }}>
            <dt style={{ float:"left",clear:"left",width:120 }}>出発地：住所</dt>
            <dd style={{ marginLeft:120 }}>{originAddr}</dd>
            <dt style={{ float:"left",clear:"left",width:120 }}>到着地：住所</dt>
            <dd style={{ marginLeft:120 }}>{destinationAddr}</dd>
            <dt style={{ float:"left",clear:"left",width:120 }}>経路上の距離</dt>
            <dd style={{ marginLeft:120 }}>{rawKm!.toFixed(1)}km</dd>
            <dt style    ={{ float:"left",clear:"left",width:120 }}>運賃計算距離</dt>
            <dd style   ={{ marginLeft:120 }}>{roundedKm}km</dd>
            <dt style={{ float:"left",clear:"left",width:120 }}>高速道路利用</dt>
            <dd style={{ marginLeft:120 }}>{useHighway?"利用する":"利用しない"}</dd>
            <dt style  ={{ float:"left",clear:"left",width:120 }}>車　　　　種</dt>
            <dd style={{ marginLeft:120 }}>
              {{
                small:"小型車(2t)",
                medium:"中型車(4t)",
                large:"大型車(10t)",
                trailer:"トレーラ(20t)"
              }[vehicle]}
            </dd>
            <dt style  ={{ float:"left",clear:"left",width:120 }}>届出：運輸局</dt>
            <dd style={{ marginLeft:120 }}>{region}運輸局</dd>
          </dl>
        </div>
      )}

      {/* 注意書き */}
      <div style={{
        marginTop:24,padding:"0 16px",fontSize:12,lineHeight:1.6,color:"#555",maxWidth:600
      }}>
        <p>●標準的運賃は、令和６年国土交通省告示第209号（2024/03/22）を踏まえ算出されます。</p>
        <p>●青色ピンは出発地、赤色ピンは到着地です。</p>
        <p>●算出される距離と実際の走行距離に誤差が発生する場合があります。</p>
        <p>●地図データの状況により出発地の住所が取得できない場合は、近隣エリアを起点、終点として算出します。</p>
        <p>●割増、割引、燃料サーチャージ、高速道路利用料金などの詳細計算につきましては、７月頃の公開を予定しています。</p>
        <p>●フェリー区間が想定される場合、「高速道路を利用する」を選択してください。</p>
        <p>◆計算システムの提供：公益社団法人全日本トラック協会</p>
        <p>◆お問合せ先：日本ＰＭＩコンサルティング株式会社　メールアドレス：a@jta-r.jp</p>
        <p style={{ marginTop:12 }}>計算システム改訂版公開　2025年5月22日</p>
      </div>
    </div>
  );
}
