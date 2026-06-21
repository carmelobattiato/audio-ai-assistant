import React from 'react';
import { NewCalWeekView, NewCalWeekViewProps } from './NewCalWeekView';

export const NewCalWorkWeekView: React.FC<Omit<NewCalWeekViewProps, 'days'>> = (props) => (
  <NewCalWeekView {...props} days={5} />
);
