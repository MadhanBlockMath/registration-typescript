import nodemailer from 'nodemailer';

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'kdmadhan007.mk@gmail.com',
    pass: 'ihhd tcop ebmm hqlt' // Note: Consider using environment variables for sensitive information.
  }
});

// Function to send confirmation email
export const sendConfirmationEmail = (email: string, username: string, orgname: string) => {
  const mailOptions = {
    from: 'kdmadhan007.mk@gmail.com',
    to: email,
    subject: 'Registration Successful',
    text: `Dear ${username},\n\nYour registration to the organization "${orgname}" has been successful. We will inform you once the network is created based on your requirements.\n\nThank you,\nTeam`
  };

  transporter.sendMail(mailOptions, (error: Error | null, info: nodemailer.SentMessageInfo) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};

// Function to send network creation email
export const sendNetworkCreatedEmail = (email: string, username: string, orgname: string, networkId: string) => {
  const mailOptions = {
    from: 'kdmadhan007.mk@gmail.com',
    to: email,
    subject: 'Network Created',
    text: `Dear ${username},\n\nWe are pleased to inform you that your network for the organization "${orgname}" has been successfully created. Your unique network ID is ${networkId}.\n\nThank you,\nTeam`
  };

  transporter.sendMail(mailOptions, (error: Error | null, info: nodemailer.SentMessageInfo) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};
