import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import SubmitPage from './pages/SubmitPage';
import SeatPage from './pages/SeatPage';
import EditSeatPage from './pages/EditSeatPage';
import MapPage from './pages/MapPage';
import { lazy, Suspense } from 'react';

// admin dipisah ke chunk sendiri, tidak ikut dimuat pengunjung biasa
const AdminPage = lazy(() => import('./pages/AdminPage'));
import { PageState } from './components/ui';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <PageState kind="error" title="Halaman error">Coba muat ulang halaman ya.</PageState>,
    children: [
      { index: true, element: <MapPage /> },
      { path: 'isi', element: <SubmitPage /> },
      { path: 'seat/:id', element: <SeatPage /> },
      { path: 'seat/:id/edit', element: <EditSeatPage /> },
      {
        path: 'admin',
        element: (
          <Suspense fallback={<PageState kind="loading" title="Memuat…" />}>
            <AdminPage />
          </Suspense>
        ),
      },
      { path: '*', element: <PageState kind="empty" title="Halaman nggak ada">Cek lagi link-nya.</PageState> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
