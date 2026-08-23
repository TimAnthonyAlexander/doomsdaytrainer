import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/ui/PageTitle';

export function IntroStep() {
  return (
    <>
      <PageTitle>Any date, in your head</PageTitle>
      <Typography variant="body1" color="text.secondary">
        Give the app a full date and tap the weekday it fell on. The Doomsday method gets you
        there in four pieces: a century anchor, a year code, the month&apos;s doomsday, and a
        count from that doomsday to your date. The app teaches all four and drills each one on
        its own.
      </Typography>
    </>
  );
}
