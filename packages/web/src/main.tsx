import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Amplify } from 'aws-amplify';
import { Config } from './config';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: Config.USER_POOL_ID,
      userPoolClientId: Config.USER_POOL_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: Config.COGNITO_DOMAIN,
          scopes: ['email', 'profile', 'openid'],
          redirectSignIn: [Config.REDIRECT_URI],
          redirectSignOut: [Config.REDIRECT_URI],
          responseType: 'code',
        }
      }
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
)
