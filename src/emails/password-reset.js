import { html } from 'htm/react';
import {
  Html,
  Head,
  Body,
  Container,
  Button,
  Img,
  Text,
} from '@react-email/components';

/**
 * @param {object} props
 * @param {string} props.token
 * @param {string} props.publicUrl
 */
export default function PasswordResetEmail({
  token = '12c6c577-593a-45d5-861b-4432e4269847',
  publicUrl = 'https://wlk.yt',
}) {
  const bodyStyle = {
    background: '#151515',
    color: '#ffffff',
    fontFamily: 'Open Sans, sans-serif',
    fontSize: 16,
  };

  return html`
    <${Html} lang="en" dir="ltr">
      <${Head}>
        <title>üWave Password Reset Request</title>
      <//>
      <${Body} style=${bodyStyle}>
        <${Container}>
          <${Img} src="https://wlk.yt/static/logo-white-ff06e202.png" alt="" width="400" />
          <${Text}>Hello,<//>
          <${Text}>Please press this button to reset your password:<//>
          <${Button} href="${publicUrl}/reset/${token}">
            Reset Password
          <//>

          <${Text}>Or, if that does not work, copy and paste this link:<//>
          <${Text}>${publicUrl}/reset/${token}<//>

          <${Text}>Regards,<//>
        <//>
      <//>
    <//>
  `;
}
