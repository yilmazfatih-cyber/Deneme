import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ensureSeeded } from './db/seed';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Production = lazy(() => import('./pages/Production'));
const Stock = lazy(() => import('./pages/Stock'));
const Customers = lazy(() => import('./pages/Customers'));
const Orders = lazy(() => import('./pages/Orders'));
const Camera = lazy(() => import('./pages/Camera'));
const Finance = lazy(() => import('./pages/Finance'));
const Documents = lazy(() => import('./pages/Documents'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Settings = lazy(() => import('./pages/Settings'));

function Loading() {
  return <p className="muted">Yükleniyor…</p>;
}

export default function App() {
  useEffect(() => {
    void ensureSeeded();
  }, []);
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="urunler" element={<Products />} />
            <Route path="urunler/:id" element={<ProductDetail />} />
            <Route path="uretim" element={<Production />} />
            <Route path="stok" element={<Stock />} />
            <Route path="musteriler" element={<Customers />} />
            <Route path="siparisler" element={<Orders />} />
            <Route path="kamera" element={<Camera />} />
            <Route path="finans" element={<Finance />} />
            <Route path="belgeler" element={<Documents />} />
            <Route path="asistan" element={<Assistant />} />
            <Route path="ayarlar" element={<Settings />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
