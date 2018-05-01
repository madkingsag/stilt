// @flow

import App from '@stilt/core';
import StiltRest from '@stilt/rest';
import StiltHttp from '@stilt/http';

const app = new App();

app.use(new StiltHttp({
  port: 3001,
}));

app.use(new StiltRest({
  controllers: `${__dirname}/controllers`,
}));
