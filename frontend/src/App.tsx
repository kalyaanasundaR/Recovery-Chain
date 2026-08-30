import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import CaseDetail from './pages/CaseDetail';
import Cases from './pages/Cases';
import DatasetLibrary from './pages/DatasetLibrary';
import DatasetAnalysis from './pages/DatasetAnalysis';

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/case/:caseId" element={<CaseDetail />} />
          <Route path="/datasets" element={<DatasetLibrary />} />
          <Route path="/dataset/:datasetId" element={<DatasetAnalysis />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
