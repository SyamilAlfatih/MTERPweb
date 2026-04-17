import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'react-photo-view/dist/react-photo-view.css';
import { PhotoProvider } from 'react-photo-view';
import App from './App.tsx'
import './i18n'; // Import i18n for initialization

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div>Loading...</div>}>
      <PhotoProvider
        maskOpacity={0.8}
        speed={() => 300}
      >
        <App />
      </PhotoProvider>
    </Suspense>
  </StrictMode>,
)
