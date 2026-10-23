import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import Layout from './components/Layout.jsx';
import AccountGate from './components/AccountGate.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Animals from './pages/Animals.jsx';
import Health from './pages/Health.jsx';
import Feeding from './pages/Feeding.jsx';
import Breeding from './pages/Breeding.jsx';
import Production from './pages/Production.jsx';
import Finance from './pages/Finance.jsx';
import Tasks from './pages/Tasks.jsx';
import Calendar from './pages/Calendar.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import OneHealth from './pages/OneHealth.jsx';
import Assistant from './pages/Assistant.jsx';
import Join from './pages/Join.jsx';
import OrgDashboard from './pages/org/OrgDashboard.jsx';
import OrgFarmers, { OrgFarmerRecords } from './pages/org/OrgFarmers.jsx';
import OrgLinks from './pages/org/OrgLinks.jsx';
import { OrgActivity, OrgProfile, OrgStaff } from './pages/org/OrgManage.jsx';
import { useAccount } from './components/AccountGate.jsx';

function RequireAuth({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/" replace />;
  return children;
}

/* Organization accounts and farmer accounts are separate: each only reaches
   its own screens (the server enforces the same rule on every request). */
function FarmerOnly({ children }) {
  const { account } = useAccount();
  return account.kind === 'organization' ? <Navigate to="/organization" replace /> : children;
}
function OrgOnly({ children }) {
  const { account } = useAccount();
  return account.kind === 'organization' ? children : <Navigate to="/dashboard" replace />;
}
const F = (el) => <FarmerOnly>{el}</FarmerOnly>;
const O = (el) => <OrgOnly>{el}</OrgOnly>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/join/:token" element={<Join />} />
      <Route element={<RequireAuth><AccountGate><Layout /></AccountGate></RequireAuth>}>
        <Route path="/dashboard" element={F(<Dashboard />)} />
        <Route path="/animals" element={F(<Animals />)} />
        <Route path="/health" element={F(<Health />)} />
        <Route path="/feeding" element={F(<Feeding />)} />
        <Route path="/breeding" element={F(<Breeding />)} />
        <Route path="/production" element={F(<Production />)} />
        <Route path="/finance" element={F(<Finance />)} />
        <Route path="/tasks" element={F(<Tasks />)} />
        <Route path="/calendar" element={F(<Calendar />)} />
        <Route path="/reports" element={F(<Reports />)} />
        <Route path="/assistant" element={F(<Assistant />)} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/onehealth" element={<OneHealth />} />
        <Route path="/organization" element={O(<OrgDashboard />)} />
        <Route path="/organization/farmers" element={O(<OrgFarmers />)} />
        <Route path="/organization/farmers/:farmerId" element={O(<OrgFarmerRecords />)} />
        <Route path="/organization/links" element={O(<OrgLinks />)} />
        <Route path="/organization/staff" element={O(<OrgStaff />)} />
        <Route path="/organization/profile" element={O(<OrgProfile />)} />
        <Route path="/organization/activity" element={O(<OrgActivity />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
