const { validationResult } = require("express-validator");

const fs = require("fs");
const path = require("path");
const socket = require("../socket");

const Post = require("../models/post");
const User = require("../models/user");
exports.getPosts = (req, res, next) => {
  console.log(req.query);
  const currentPage = req.query.page || 1;
  const perPage = 2;
  let totalItems;
  Post.find()
    .countDocuments()
    .then((count) => {
      totalItems = count;
      return Post.find()
        .populate("creator")
        .skip((currentPage - 1) * perPage)
        .limit(perPage);
    })
    .then((posts) => {
      res.status(200).json({
        message: "Fetched posts successfully.",
        posts: posts,
        totalItems: totalItems,
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.postPost = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new Error("Validation failed, entered data is incorrect.");
    error.statusCode = 422;
    throw error;
  }
  if (!req.file) {
    const error = new Error("No image provided.");
    res.statusCode = 422;
    throw error;
  }

  const imageUrl = req.file.path.replace("\\", "/");
  const title = req.body.title;
  const content = req.body.content;
  let creator;

  const post = new Post({
    title: title,
    content: content,
    imageUrl: imageUrl,
    creator: req.userId,
  });
  console.log(req.userId);
  try {
    await post.save();
    const user = await User.findById(req.userId);
    user.post.push(post);
    await user.save();
    socket.getIO().emit("posts", { action: "create", post: post });

    res.status(201).json({
      message: "post Created",
      post: post
    });
  } catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
    console.log("created posts");
  }
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const error = new Error("could not be found");
        res.statusCode = 404;
        throw error;
      }

      res.status(200).json({ message: "Post fetched", post: post });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.updatePost = (req, res, next) => {
  const postId = req.params.postId;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed, entered data is incorrect.");
    error.statusCode = 422;
    throw error;
  }
  const title = req.body.title;
  const content = req.body.content;
  let imageUrl = req.body.image;
  if (req.file) {
    imageUrl = req.file.path;
  }
  if (!imageUrl) {
    const error = new Error("no File picked");
    error.statusCode = 422;
  }

  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const error = new Error("could not be found");
        res.statusCode = 404;
        throw error;
      }
      if (post.creator.toString() !== req.userId) {
        throw new Error("not authorized");
      }

      if (imageUrl !== post.imageUrl) {
        clearImage(post.imageUrl);
      }
      post.title = title;
      post.imageUrl = imageUrl;
      post.content = content;

      return post.save();
    })
    .then((result) => {
      socket.getIO().emit("posts", { action: "create", post: result });
      res.status(200).json({ message: "Post is updated", post: result });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId.toString().trim();
  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const error = new Error("Post does not exist");
        error.statusCode = 404;
        throw error;
      }
      if (post.creator.toString() !== req.userId) {
        throw new Error("not authorized");
      }
      // clearImage(post.imageUrl);
      console.log(postId);
      Post.findByIdAndDelete(postId)
        .then((res) => console.log(res))
        .catch((err) => console.log(err));
    })
    .then((result) => {
      console.log("res", result);

      return User.findById(req.userId);
    })
    .then((user) => {
      console.log("user:", user);
      user.post.pull(postId);
      console.log("user1:", user);
      return user.save();
    })
    .then((result) => {
      socket.getIO().emit("posts", { action: "create", post: result });

      res.status(200).json({ message: "Deleted Post" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

const clearImage = (filePath) => {
  filePath = path.join(__dirname, "../images", filePath);
  fs.unlink(filePath, (err) => console.log(err));
};
