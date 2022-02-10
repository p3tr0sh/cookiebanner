import { createElement } from 'react';
import ReactDOM = require('react-dom');

window.addEventListener('DOMContentLoaded', async () => {
  const { BannerWindow } = await import('./components/banner-window');
  ReactDOM.render(createElement(BannerWindow), document.body);
});
