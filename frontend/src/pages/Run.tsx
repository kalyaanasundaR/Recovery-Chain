import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Upload, ArrowRight } from 'lucide-react';
import {
    uploadData, analyzeData, getImportStatus, previewData, confirmColumns,
    prepareForCases, buildCases,
} from '../lib/api';
import { money } from '../lib/format';
import { Card, Button, Spinner, ErrorNote } from '../ui';

const STEPS = ['Import your data', 'Confirm the columns', 'Run', 'Results'];

// the four things a recovery run needs from your file
const ROLES = [
    { key: 'CUSTOMER_ID', label: 'Customer', hint: 'who owes the money' },
    { key: 'AMOUNT', label: 'Amount', hint: 'how much' },
    { key: 'TIMESTAMP', label: 'Date', hint: 'when it failed / was due' },
    { key: 'OUTCOME', label: 'Result', hint: 'paid or failed' },
];

export default function Run() {
    const nav = useNavigate();
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState('');
    const [err, setErr] = useState('');

    const [importId, setImportId] = useState('');
    const [preview, setPreview] = useState<any>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [pick, setPick] = useState<Record<string, string>>({}); // role -> column
    const [result, setResult] = useState<any>(null);

    // --- step 1: import ------------------------------------------------------
    async function importFile(file: File) {
        setErr(''); setBusy('Uploading and reading your file…');
        try {
            const { dataset_id } = await uploadData(file);
            await analyzeData(dataset_id);
            const [status, prev] = await Promise.all([getImportStatus(dataset_id), previewData(dataset_id, 8)]);
            setImportId(dataset_id);
            setPreview(prev);
            const cols = (prev.columns || []).map((c: any) => c.original_name);
            setColumns(cols);
            // pre-fill picks from what the importer detected
            const guess: Record<string, string> = {};
            for (const f of status.detected_canonical_fields || []) {
                const role = f.canonical_field === 'ACCOUNT_ID' || f.canonical_field === 'ENTITY_ID' ? 'CUSTOMER_ID'
                    : f.canonical_field === 'BALANCE' ? 'AMOUNT'
                        : f.canonical_field === 'TARGET' ? 'OUTCOME' : f.canonical_field;
                if (ROLES.some(r => r.key === role) && !guess[role]) guess[role] = f.original_column;
            }
            setPick(guess);
            setStep(1);
        } catch (e: any) { setErr(e.message); }
        setBusy('');
    }

    async function useSample() {
        setBusy('Loading sample data…');
        try {
            const blob = await fetch('/sample.csv').then(r => r.blob());
            await importFile(new File([blob], 'sample.csv', { type: 'text/csv' }));
        } catch (e: any) { setErr(e.message); setBusy(''); }
    }

    // --- step 2: confirm columns -----------------------------------------
    async function confirm() {
        setErr('');
        const missing = ROLES.filter(r => !pick[r.key]);
        if (missing.length) { setErr(`Please choose a column for: ${missing.map(m => m.label).join(', ')}`); return; }
        setBusy('Saving your column choices…');
        try {
            const used = new Set(Object.values(pick));
            const mappings = [
                ...ROLES.map(r => ({ original_column: pick[r.key], canonical_field: r.key, action: 'confirm' })),
                ...columns.filter(c => !used.has(c)).map(c => ({ original_column: c, canonical_field: 'UNKNOWN', action: 'unused' })),
            ];
            await confirmColumns(importId, mappings);
            setStep(2);
        } catch (e: any) { setErr(e.message); }
        setBusy('');
    }

    // --- step 3: run --------------------------------------------------------
    async function run() {
        setErr(''); setBusy('Preparing…');
        try {
            const spec = await prepareForCases(importId);
            if (!String(spec.readiness_status || '').includes('READY')) {
                setErr(`This data can’t be used for a run: ${spec.warnings?.join(' ') || spec.readiness_status}`);
                setBusy(''); return;
            }
            setBusy('Working through each failed payment…');
            const r = await buildCases(importId, 200);
            setResult(r);
            setStep(3);
        } catch (e: any) { setErr(e.message); }
        setBusy('');
    }

    return (
        <div className="fade-in mx-auto max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-100">New recovery run</h1>
                <p className="mt-1 text-slate-400">Four steps, start to finish.</p>
            </div>

            <ol className="flex flex-wrap gap-2 text-sm">
                {STEPS.map((s, i) => (
                    <li key={s} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
                        i === step ? 'bg-blue-600 text-white' : i < step ? 'bg-slate-800 text-slate-300' : 'bg-slate-900 text-slate-500'
                    }`}>
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-black/20 text-xs">
                            {i < step ? <Check size={12} /> : i + 1}
                        </span>
                        {s}
                    </li>
                ))}
            </ol>

            {err && <ErrorNote>{err}</ErrorNote>}
            {busy && <Card><Spinner label={busy} /></Card>}

            {/* STEP 1 */}
            {step === 0 && !busy && (
                <Card title="Import your data" subtitle="A CSV with your failed payments — one row per payment.">
                    <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-700 p-10 text-center hover:border-slate-500">
                        <Upload className="text-slate-400" />
                        <span className="font-medium text-slate-200">Choose a CSV file</span>
                        <span className="text-sm text-slate-500">or drag it here</span>
                        <input type="file" accept=".csv,.parquet,.xlsx" className="hidden"
                            onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
                    </label>
                    <div className="mt-4 text-center text-sm text-slate-500">
                        No file handy? <button onClick={useSample} className="font-medium text-blue-400 hover:underline">Use sample data</button>
                    </div>
                </Card>
            )}

            {/* STEP 2 */}
            {step === 1 && !busy && (
                <Card title="Confirm the columns"
                    subtitle="Tell us which of your columns means what. We’ve guessed — check it’s right.">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {ROLES.map(r => (
                            <div key={r.key}>
                                <label className="text-sm font-medium text-slate-200">{r.label}</label>
                                <p className="mb-1 text-xs text-slate-500">{r.hint}</p>
                                <select
                                    value={pick[r.key] || ''}
                                    onChange={e => setPick({ ...pick, [r.key]: e.target.value })}
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                                >
                                    <option value="">— choose a column —</option>
                                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>

                    {preview?.rows?.length > 0 && (
                        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-900 text-left text-slate-400">
                                    <tr>{columns.map(c => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 text-slate-300">
                                    {preview.rows.slice(0, 5).map((row: any, i: number) => (
                                        <tr key={i}>{columns.map(c => <td key={c} className="px-3 py-1.5">{String(row[c] ?? '')}</td>)}</tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="mt-5 flex justify-end">
                        <Button onClick={confirm}>Looks right — continue <ArrowRight size={16} /></Button>
                    </div>
                </Card>
            )}

            {/* STEP 3 */}
            {step === 2 && !busy && (
                <Card title="Run the recovery"
                    subtitle="We’ll create a case for each failed payment, work out why it failed, pick the safest action, and act on the ones that are safe to act on. Anything risky waits for you.">
                    <Button onClick={run}>Run it</Button>
                </Card>
            )}

            {/* STEP 4 */}
            {step === 3 && result && (
                <Card title="Results">
                    <p className="text-slate-300">
                        Created <b className="text-slate-100">{result.cases_generated}</b> case
                        {result.cases_generated === 1 ? '' : 's'} from <b>{result.counters?.rows_seen ?? '—'}</b> rows.
                        {result.counters?.rows_skipped ? ` ${result.counters.rows_skipped} rows were skipped (already paid, missing data, or unclear).` : ''}
                    </p>
                    <div className="mt-5 flex gap-3">
                        <Link to="/cases"><Button>See the cases <ArrowRight size={16} /></Button></Link>
                        <Button variant="ghost" onClick={() => { setStep(0); setResult(null); setImportId(''); setPreview(null); setPick({}); }}>
                            Start another run
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
}
