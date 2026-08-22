import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/ui/Screen';
import { TableDrillView } from '@/features/weekday/TableDrillView';

/**
 * The twelve month doomsdays and the four century anchors, drilled directly.
 *
 * The only surface under Doomsdays that writes to the schedule: sixteen fixed
 * items go through the same SM-2 machinery as the year codes, and a wrong
 * weekday on the date trainer still never touches them.
 */
export function TablesScreen() {
  const navigate = useNavigate();
  return (
    <Screen gap={2}>
      <TableDrillView onBack={() => navigate('/doomsdays')} />
    </Screen>
  );
}
