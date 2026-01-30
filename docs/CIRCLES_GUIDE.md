# Testing Circles & Mail Feature

This guide shows how to test the new circles and mail functionality using curl commands.

## Prerequisites
- Backend server running on `http://localhost:3000`
- At least 2 registered users

## Step 1: Create Users

```bash
# Register User 1
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "pin": "1234"}'

# Register User 2
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username": "bob", "pin": "5678"}'
```

## Step 2: Login Both Users

```bash
# Login Alice
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "pin": "1234"}'

# Save the sessionId from response as ALICE_SESSION

# Login Bob
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "bob", "pin": "5678"}'

# Save the sessionId from response as BOB_SESSION
```

## Step 3: Alice Creates a Circle

```bash
curl -X POST http://localhost:3000/api/circles \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ALICE_SESSION" \
  -d '{"name": "Family", "description": "Our family fridge"}'

# Save the circle id from response as CIRCLE_ID
```

## Step 4: Alice Invites Bob

```bash
curl -X POST http://localhost:3000/api/circles/CIRCLE_ID/members \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ALICE_SESSION" \
  -d '{"username": "bob"}'
```

## Step 5: Bob Sends Mail to Circle

```bash
# Text-only mail
curl -X POST http://localhost:3000/api/mail \
  -H "X-Session-Id: BOB_SESSION" \
  -F "circleId=CIRCLE_ID" \
  -F "subject=Hello!" \
  -F "content=Check out this memory"

# Mail with image
curl -X POST http://localhost:3000/api/mail \
  -H "X-Session-Id: BOB_SESSION" \
  -F "circleId=CIRCLE_ID" \
  -F "subject=Vacation Photo" \
  -F "content=From our trip last summer" \
  -F "file=@/path/to/photo.jpg"
```

## Step 6: Alice Checks Mail

```bash
curl -X GET http://localhost:3000/api/mail \
  -H "X-Session-Id: ALICE_SESSION"
```

## Step 7: Alice Converts Mail to Magnet

```bash
# Get mail ID from previous response
curl -X POST http://localhost:3000/api/mail/MAIL_ID/convert \
  -H "X-Session-Id: ALICE_SESSION"
```

Now the mail item appears as a magnet on Alice's fridge!

## Step 8: View in Browser

1. Navigate to `http://localhost:3000`
2. Login as Alice
3. Open the fridge door (click handle)
4. See the Mail panel with Bob's message
5. Click "📌 Add to Fridge" on any mail with media
6. Close the door to see the magnet on your fridge

## Example Workflow: Family Photo Sharing

```bash
# Mom creates "The Family" circle
# Mom invites Dad, Sister, Brother

# Sister sends photo from her graduation
curl -X POST http://localhost:3000/api/mail \
  -H "X-Session-Id: SISTER_SESSION" \
  -F "circleId=1" \
  -F "subject=Graduation Day!" \
  -F "file=@graduation.jpg"

# Everyone in the family receives it in their mail
# Each person can add it to their own fridge

# Brother sends a video
curl -X POST http://localhost:3000/api/mail \
  -H "X-Session-Id: BROTHER_SESSION" \
  -F "circleId=1" \
  -F "subject=Soccer Game Highlight" \
  -F "file=@soccer_goal.mp4"

# Mom adds both to her fridge - they become magnets she can position
```

## Tips

- Each user sees mail from ALL circles they belong to
- Converting mail to magnet respects the user's magnet limit (default 2)
- Media files are shared (not duplicated) when converted to magnets
- Circle admins can invite new members
- Mail items show "✓ On fridge" once converted by that user
