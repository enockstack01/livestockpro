import RecordListScreen from '../../src/screens/RecordListScreen';
import { TABLES } from '../../src/config/tables';

export default function FeedingScreen() {
  return <RecordListScreen config={TABLES.feeding_records} />;
}
