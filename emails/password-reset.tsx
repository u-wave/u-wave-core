import {
  Html,
  Head,
  Body,
  Button,
  Img,
  Text,
} from '@react-email/components';

export default function PasswordResetEmail({
  token = '12c6c577-593a-45d5-861b-4432e4269847',
}) {
  return (
    <Html>
      <Head>
        <title>Password Reset Request</title>
      </Head>
      <Body style={{
        background: '#151515',
        color: '#ffffff',
        fontFamily: 'Open Sans, sans-serif',
        fontSize: 16,
      }}>
        <Img
          src="https://wlk.yt/static/logo-white-ff06e202.png"
          alt=""
          width="400"
        />
        <Text>Hello,</Text>
        <Text>Please press this button to reset your password:</Text>
        <Button
          href={`https://wlk.yt/reset/${token}`}
        >
          Reset Password
        </Button>

        <Text>Or, if that does not work, copy and paste this link:</Text>
        <Text>{`https://wlk.yt/reset/${token}`}</Text>

        <Text>Regards,</Text>
      </Body>
    </Html>
  );
}
