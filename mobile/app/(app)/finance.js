import RecordListScreen from '../../src/screens/RecordListScreen';
import { TABLES } from '../../src/config/tables';

export default function FinanceScreen() {
  return <RecordListScreen config={TABLES.finance_records} />;
}
