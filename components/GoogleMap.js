// ...existing code...

// 既存の関数内で修正
const calculateRoute = () => {
  const request = {
    origin: departure,
    destination: arrival,
    travelMode: 'DRIVING'
  };

  directionsService.route(request, (result, status) => {
    if (status === 'OK') {
      directionsRenderer.setDirections(result);
      
      // 追加: 経路全体が見えるように地図を自動調整
      const bounds = result.routes[0].bounds;
      map.fitBounds(bounds);
      
      // 既存の処理（距離計算など）
      calculateDistance(result);
    }
  });
};

// ...existing code...