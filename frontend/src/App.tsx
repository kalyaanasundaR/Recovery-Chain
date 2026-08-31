import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Shell from './Shell';
import Home from './pages/Home';
import Run from './pages/Run';
import CasesList from './pages/CasesList';
import CaseView from './pages/CaseView';

export default function App() {
    return (
        <BrowserRouter>
            <Shell>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/run" element={<Run />} />
                    <Route path="/cases" element={<CasesList />} />
                    <Route path="/cases/:caseId" element={<CaseView />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Shell>
        </BrowserRouter>
    );
}
