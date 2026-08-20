import RecordListScreen from '../../src/screens/RecordListScreen';
import { TABLES } from '../../src/config/tables';

export default function AnimalsScreen() {
  return <RecordListScreen config={TABLES.animals} />;
}
