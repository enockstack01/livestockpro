import RecordListScreen from '../../src/screens/RecordListScreen';
import { TABLES } from '../../src/config/tables';

export default function ProductionScreen() {
  return <RecordListScreen config={TABLES.production_records} />;
}
