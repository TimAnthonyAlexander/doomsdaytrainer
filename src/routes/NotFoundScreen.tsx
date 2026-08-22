import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { PageTitle } from '@/components/ui/PageTitle';
import { Screen } from '@/components/ui/Screen';

export function NotFoundScreen() {
  return (
    <Screen>
      <PageTitle>Not found</PageTitle>
      <Typography variant="body1" color="text.secondary">
        There is no screen at this address.
      </Typography>
      <Box>
        <Button component={RouterLink} to="/" variant="outlined">
          Go to Revise
        </Button>
      </Box>
    </Screen>
  );
}
