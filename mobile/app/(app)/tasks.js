import RecordListScreen from '../../src/screens/RecordListScreen';
import { TABLES } from '../../src/config/tables';

export default function TasksScreen() {
  return <RecordListScreen config={TABLES.tasks} />;
}
