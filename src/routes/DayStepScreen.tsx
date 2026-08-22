import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/ui/Screen';
import { DayStepView } from '@/features/weekday/DayStepView';

/**
 * The last step of the method, timed on its own.
 *
 * A route rather than a view inside the Weekday screen, so the shell names it
 * in the phone's title bar and the browser's back button is the way out. The
 * view still draws its own back row, because the grid it came from is the
 * thing to return to and no nav entry points at it.
 */
export function DayStepScreen() {
  const navigate = useNavigate();
  return (
    <Screen gap={2} sx={{ flex: 1 }}>
      <DayStepView onBack={() => navigate('/doomsdays')} />
    </Screen>
  );
}
