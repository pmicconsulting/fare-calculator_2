// pages/index.tsx

import Head from 'next/head';
import GoogleMap from "../components/GoogleMap";

export default function Home() {
  return (
    <>
      <Head>
        <title>標準的運賃の計算【令和6年告示】</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
          標準的運賃の計算【令和6年告示】
        </h1>
        <GoogleMap />
      </main>
    </>
  );
}