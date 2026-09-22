import { Routes, Route, Navigate } from 'react-router-dom';
import NavShell from './components/NavShell.jsx';
import RequestQueue from './pages/RequestQueue.jsx';
import AccountTruth from './pages/AccountTruth.jsx';
import PodCapacity from './pages/PodCapacity.jsx';
import OnePagers from './pages/OnePagers.jsx';
import FinanceReconciliation from './pages/FinanceReconciliation.jsx';
import DecisionLog from './pages/DecisionLog.jsx';

export default function App() {
  return (
    <NavShell>
      <Routes>
        <Route path="/" element={<Navigate to="/accounts" replace />} />
        <Route path="/queue" element={<RequestQueue />} />
        <Route path="/accounts" element={<AccountTruth />} />
        <Route path="/pods" element={<PodCapacity />} />
        <Route path="/one-pagers" element={<OnePagers />} />
        <Route path="/finance" element={<FinanceReconciliation />} />
        <Route path="/decisions" element={<DecisionLog />} />
      </Routes>
    </NavShell>
  );
}
