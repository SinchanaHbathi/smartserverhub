# SmartServerHub – Restaurant QR Ordering System

SmartServerHub is a web-based restaurant management and QR code ordering system that allows restaurants to manage their menus, receive customer orders, and handle payments digitally.

## Features

- **Restaurant Registration & Login:** Secure authentication for restaurant managers.
- **Menu Management:** Add, edit, and manage food items, categories, and prices.
- **AI Menu Scanning:** Upload menu images to extract food names, prices, and categories.
- **QR Code Generation:** Generate table-specific QR codes for customers to access the restaurant menu.
- **Customer Ordering:** Customers can scan a QR code, browse the menu, add items to their cart, and place orders without creating an account.
- **Order Management:** Managers can view customer orders and update order statuses.
- **UPI Payments:** Supports a restaurant payment QR workflow for payments through apps such as PhonePe and Google Pay.
- **Payment Confirmation:** Customers can claim payment, and managers can confirm receipt.
- **Cash Payments:** Customers can choose to pay at the counter.
- **Database Integration:** MongoDB stores restaurant and application data.
- **Responsive Design:** Designed for convenient use on mobile phones and computers.

## Order Workflow

Customers scan a table QR code, select food items, and place an order. The order appears in the restaurant manager's dashboard. Customers can choose UPI payment or payment at the counter. For UPI orders, the manager verifies receipt and confirms the payment.

Order statuses can progress through:

`Placed → Payment Claimed → Confirmed → Preparing → Ready → Served`

## Technology Stack

- **Frontend:** React, Vite, CSS
- **Backend:** Node.js, Express.js
- **Database:** MongoDB Atlas
- **Authentication:** Token-based authentication
- **Deployment:** Vercel (frontend), Render (backend)
- **Version Control:** Git and GitHub

## Live Demo

- **Frontend:** https://smartserverhub.vercel.app/
- **Backend:** https://smartserverhub.onrender.com/

## Project Objective

The objective of SmartServerHub is to simplify restaurant operations by digitizing menu access, table-based ordering, order management, and payment confirmation. It helps reduce manual ordering work and provides customers with a convenient way to order food using their smartphones.

## Future Enhancements

- Real-time order and payment status updates.
- Multilingual customer interface supporting English, Kannada, and Hindi.
- Sales reports and order analytics.
- Improved menu scanning and category recognition.

## Author

Developed as a web development project to improve the restaurant ordering and management experience.
