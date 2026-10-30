import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { queryClient } from '@/api/query-client';

function HomePlaceholder() {
  
    return (
    <main style={{ padding: 'var(--space-8)' }}>
      <h1>LinkVault</h1>
      <p>Fundação Fase 1.</p>
    </main>
  );

}

export function App() {
  
    return (
    <QueryClientProvider client={queryClient}>
      
      <BrowserRouter>
      
        <Routes>
      
          <Route path="/" element={<HomePlaceholder />} />
      
        </Routes>
      
      </BrowserRouter>

    </QueryClientProvider>
  );

}