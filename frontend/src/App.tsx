import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Shell from './Shell';
import Workflow from './workflow/Workflow';
import Home from './pages/Home';
import CasesList from './pages/CasesList';
import CaseView from './pages/CaseView';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* primary experience — the guided workflow, its own full-screen chrome */}
                <Route path="/" element={<Workflow />} />

                {/* secondary / exploration views */}
                <Route path="/overview" element={<Shell><Home /></Shell>} />
                <Route path="/cases" element={<Shell><CasesList /></Shell>} />
                <Route path="/cases/:caseId" element={<Shell><CaseView /></Shell>} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
