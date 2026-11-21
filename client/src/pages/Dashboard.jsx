import { useAccount } from '../components/AccountGate.jsx';
import ManagerDashboard from './ManagerDashboard.jsx';
import CollectorDashboard from './CollectorDashboard.jsx';

/* One route, two dashboards: a data collector gets a field-work screen built
   for recording (big record buttons, today's count, own tasks), a farm
   manager gets the analytic overview (herd, health, money, team). */
export default function Dashboard() {
  const { account } = useAccount();
  return account.farmRole === 'collector' ? <CollectorDashboard /> : <ManagerDashboard />;
}
