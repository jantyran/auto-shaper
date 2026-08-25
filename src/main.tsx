import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { loadSettings } from './core/settings';
import { applyTheme } from './core/theme';
import './styles.css';

// 描画前に配色を確定させる(既定と違うテーマを選んでいる人に、
// 一瞬だけ既定色が見えてしまうのを防ぐ)
applyTheme(loadSettings().theme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
