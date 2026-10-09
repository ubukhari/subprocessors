# The uploads bucket, in Frankfurt.
provider "aws" {
  region = "eu-central-1"
}

resource "aws_s3_bucket" "uploads" {
  bucket = "demo-notes-uploads"
}
