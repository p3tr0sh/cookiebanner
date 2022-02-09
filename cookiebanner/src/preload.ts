import * as React from 'react';
import ReactDOM = require('react-dom');
import { BannerWindow } from './components/banner-window';

window.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render(React.createElement(BannerWindow), document.body);
});
