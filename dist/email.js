"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNetworkCreatedEmail = exports.sendConfirmationEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// Configure Nodemailer
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: 'kdmadhan007.mk@gmail.com',
        pass: 'ihhd tcop ebmm hqlt' // Note: Consider using environment variables for sensitive information.
    }
});
// Function to send confirmation email
const sendConfirmationEmail = (email, username, orgname) => {
    const mailOptions = {
        from: 'kdmadhan007.mk@gmail.com',
        to: email,
        subject: 'Registration Successful',
        text: `Dear ${username},\n\nYour registration to the organization "${orgname}" has been successful. We will inform you once the network is created based on your requirements.\n\nThank you,\nTeam`
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        }
        else {
            console.log('Email sent:', info.response);
        }
    });
};
exports.sendConfirmationEmail = sendConfirmationEmail;
// Function to send network creation email
const sendNetworkCreatedEmail = (email, username, orgname, networkId) => {
    const mailOptions = {
        from: 'kdmadhan007.mk@gmail.com',
        to: email,
        subject: 'Network Created',
        text: `Dear ${username},\n\nWe are pleased to inform you that your network for the organization "${orgname}" has been successfully created. Your unique network ID is ${networkId}.\n\nThank you,\nTeam`
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        }
        else {
            console.log('Email sent:', info.response);
        }
    });
};
exports.sendNetworkCreatedEmail = sendNetworkCreatedEmail;
