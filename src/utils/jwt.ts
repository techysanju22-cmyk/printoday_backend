import jwt, { SignOptions } from 'jsonwebtoken';
import { Response } from 'express';

export const generateToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET || 'default_secret';
  const options: SignOptions = {
    expiresIn: '30d',
  };
  return jwt.sign({ id: userId }, secret, options);
};

export const sendTokenResponse = (userId: string, statusCode: number, res: Response) => {
  const token = generateToken(userId);

  const cookieExpire = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
  console.log("sending token--->")
  res
    .status(statusCode)
    .cookie('token', token, {
      expires: new Date(Date.now() + cookieExpire),
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    })
    .json({
      success: true,
      token,
    });
};
