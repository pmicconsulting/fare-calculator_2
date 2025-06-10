// pages/index.tsx

import Head from 'next/head';
import GoogleMap from "../components/GoogleMap"; // 地図＋計算ロジック一式
import styles from '../styles/Home.module.css';

export default function Home() {
  return (
    <>
      <Head>
        <title>標準的運賃の計算【令和6年告示】</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className={styles.container}>
        {/* 1. タイトル */}
        <h1 className={styles.title}>
          標準的運賃の計算【令和6年告示】
        </h1>

        {/* 2. 操作パネル＋計算ボタンも GoogleMap 内に含める */}
        <section className={styles.mapWrapper}>
          <GoogleMap />
        </section>
      </main>
    </>
  );
}