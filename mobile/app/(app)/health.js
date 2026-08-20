import RecordListScreen from '../../src/screens/RecordListScreen';
import { TABLES } from '../../src/config/tables';

export default function HealthScreen() {
  return <RecordListScreen config={TABLES.health_records} />;
}
