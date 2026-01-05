const User = require('./User');
const Community = require('./Community');
const UserCommunity = require('./UserCommunity');
const Post = require('./Post');
const Comment = require('./Comment');
const CommentLike = require('./CommentLike');

// User associations
User.hasMany(Community, { foreignKey: 'created_by', as: 'createdCommunities' });
User.hasMany(Post, { foreignKey: 'user_id', as: 'posts' });
User.hasMany(Comment, { foreignKey: 'user_id', as: 'comments' });
User.belongsToMany(Community, { through: UserCommunity, foreignKey: 'user_id', as: 'communities' });

// Community associations
Community.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Community.belongsToMany(User, { through: UserCommunity, foreignKey: 'community_id', as: 'members' });
Community.hasMany(Post, { foreignKey: 'community_id', as: 'posts' });

// Post associations
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
Post.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Post.hasMany(Comment, { foreignKey: 'post_id', as: 'comments' });

// Comment associations
Comment.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
Comment.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Comment.belongsTo(Comment, { foreignKey: 'parent_comment_id', as: 'parentComment' });
Comment.hasMany(Comment, { foreignKey: 'parent_comment_id', as: 'replies' });
Comment.hasMany(CommentLike, { foreignKey: 'comment_id', as: 'likes' });

// CommentLike associations
CommentLike.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
CommentLike.belongsTo(Comment, { foreignKey: 'comment_id', as: 'comment' });

module.exports = {
  User,
  Community,
  UserCommunity,
  Post,
  Comment,
  CommentLike
};
