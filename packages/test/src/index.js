// @flow

import App from '@stilt/core';
import StiltRest from '@stilt/rest';
import StiltHttp from '@stilt/http';
import StiltGraphql from '@stilt/graphql';

const app = new App();

app.use(new StiltHttp({
  port: 3001,
}));

app.use(new StiltRest({
  controllers: `${__dirname}/controllers`,
}));

app.use(new StiltGraphql({
  resolvers: `${__dirname}/controllers`,
  schema: `${__dirname}/schema`,
}));
