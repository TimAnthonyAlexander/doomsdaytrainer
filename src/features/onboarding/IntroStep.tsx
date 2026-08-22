import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/ui/PageTitle';

export function IntroStep() {
  return (
    <>
      <PageTitle>100 number pairs</PageTitle>
      <Typography variant="body1" color="text.secondary">
        Year to code, 00 through 99. The app shows you a year, you tap a code, and the ones you
        miss or answer slowly come back sooner. It does not work out dates for you and it does not
        teach the rest of the Doomsday method. Only the table.
      </Typography>
    </>
  );
}
